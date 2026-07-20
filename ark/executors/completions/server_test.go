package completions

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"math/big"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"trpc.group/trpc-go/trpc-a2a-go/taskmanager"
)

func TestHealthEndpoint(t *testing.T) {
	s := &Server{}

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()
	s.handleHealth(w, req)

	require.Equal(t, http.StatusOK, w.Code)

	var body map[string]string
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	assert.Equal(t, "healthy", body["status"])
}

// TestReadyEndpoint covers the readiness probe transitioning to failing once the pod
// starts shutting down, so it is removed from Service endpoints before draining.
func TestReadyEndpoint(t *testing.T) {
	s := &Server{}
	s.ready.Store(true)

	call := func() (int, string) {
		req := httptest.NewRequest(http.MethodGet, "/ready", nil)
		w := httptest.NewRecorder()
		s.handleReady(w, req)
		var body map[string]string
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
		return w.Code, body["status"]
	}

	code, status := call()
	assert.Equal(t, http.StatusOK, code)
	assert.Equal(t, "ready", status)

	s.SetNotReady()

	code, status = call()
	assert.Equal(t, http.StatusServiceUnavailable, code)
	assert.Equal(t, "shutting-down", status)
}

// TestStopNoHTTPServer covers Stop before Start: it must still flip readiness and cancel
// the server lifetime context (signalling any lingering executions to finalize).
func TestStopNoHTTPServer(t *testing.T) {
	shutdownCtx, cancel := context.WithCancel(context.Background())
	s := &Server{shutdownCancel: cancel}
	s.ready.Store(true)

	require.NoError(t, s.Stop(context.Background()))
	assert.False(t, s.ready.Load(), "Stop must flip readiness to false")
	assert.ErrorIs(t, shutdownCtx.Err(), context.Canceled, "Stop must cancel the server lifetime context")
}

// TestStopGracefulDrain covers the clean path: an idle running server shuts down without
// error, flips readiness, cancels the lifetime context, and stops serving.
func TestStopGracefulDrain(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)

	shutdownCtx, cancel := context.WithCancel(context.Background())
	s := &Server{shutdownCancel: cancel}
	s.ready.Store(true)

	mux := http.NewServeMux()
	mux.HandleFunc("/ready", s.handleReady)
	s.httpServer = &http.Server{Handler: mux}

	serveErr := make(chan error, 1)
	go func() { serveErr <- s.httpServer.Serve(ln) }()

	// Server is live and ready.
	readyReq, err := http.NewRequestWithContext(context.Background(), http.MethodGet, "http://"+ln.Addr().String()+"/ready", nil)
	require.NoError(t, err)
	resp, err := http.DefaultClient.Do(readyReq)
	require.NoError(t, err)
	_ = resp.Body.Close()
	require.Equal(t, http.StatusOK, resp.StatusCode)

	ctx, cancelStop := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancelStop()
	require.NoError(t, s.Stop(ctx))

	assert.False(t, s.ready.Load())
	assert.ErrorIs(t, shutdownCtx.Err(), context.Canceled)
	assert.ErrorIs(t, <-serveErr, http.ErrServerClosed)
}

// TestStopDeadlineExceeded covers the drain-deadline path: when an in-flight request
// outlasts the shutdown context, Stop returns DeadlineExceeded (after which the caller's
// finalizeGrace window lets streams close cleanly). finalizeGrace is shortened so the test
// stays fast.
func TestStopDeadlineExceeded(t *testing.T) {
	orig := finalizeGrace
	finalizeGrace = 5 * time.Millisecond
	defer func() { finalizeGrace = orig }()

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)

	released := make(chan struct{})
	inflight := make(chan struct{})
	shutdownCtx, cancel := context.WithCancel(context.Background())
	s := &Server{shutdownCancel: cancel}
	s.ready.Store(true)

	mux := http.NewServeMux()
	mux.HandleFunc("/slow", func(w http.ResponseWriter, r *http.Request) {
		close(inflight)
		<-released // block past the shutdown deadline
		w.WriteHeader(http.StatusOK)
	})
	s.httpServer = &http.Server{Handler: mux}
	go func() { _ = s.httpServer.Serve(ln) }()

	go func() {
		slowReq, reqErr := http.NewRequestWithContext(context.Background(), http.MethodGet, "http://"+ln.Addr().String()+"/slow", nil)
		if reqErr != nil {
			return
		}
		if resp, doErr := http.DefaultClient.Do(slowReq); doErr == nil {
			_ = resp.Body.Close()
		}
	}()
	<-inflight // ensure the request is being handled when we start shutting down

	ctx, cancelStop := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancelStop()
	err = s.Stop(ctx)

	assert.ErrorIs(t, err, context.DeadlineExceeded)
	assert.ErrorIs(t, shutdownCtx.Err(), context.Canceled)
	close(released)
}

func TestBuildTaskManagerMemory(t *testing.T) {
	tm, err := buildTaskManager(ServerConfig{}, &Handler{})
	require.NoError(t, err)
	require.NotNil(t, tm)
	_, isMemory := tm.(*taskmanager.MemoryTaskManager)
	assert.True(t, isMemory, "empty RedisURL must fall back to the in-memory task manager")
}

func TestBuildTaskManagerInvalidURL(t *testing.T) {
	_, err := buildTaskManager(ServerConfig{RedisURL: "://not-a-url"}, &Handler{})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "invalid redis URL")
}

// TestBuildTaskManagerUnreachable covers the bounded retry: an unreachable Redis fails
// startup only after exhausting the attempts, rather than crashlooping instantly on the
// first ping. Backoff is shortened so the test stays fast.
func TestBuildTaskManagerUnreachable(t *testing.T) {
	orig := redisConnectBackoff
	redisConnectBackoff = time.Millisecond
	defer func() { redisConnectBackoff = orig }()

	// Port 1 on loopback refuses connections immediately.
	_, err := buildTaskManager(ServerConfig{RedisURL: "redis://127.0.0.1:1"}, &Handler{})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "after 3 attempts")
}

// TestBuildTaskManagerCACertNonTLS: a CA cert path against a plain redis:// (non-TLS) URL is a
// misconfig and must fail fast, before any connection attempt.
func TestBuildTaskManagerCACertNonTLS(t *testing.T) {
	_, err := buildTaskManager(ServerConfig{
		RedisURL:        "redis://127.0.0.1:6379",
		RedisCACertPath: "/tmp/does-not-matter.crt",
	}, &Handler{})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "not rediss")
}

// TestBuildTaskManagerCACertUnreadable: a rediss:// URL with a CA path that doesn't exist fails
// on the file read, before any connection attempt.
func TestBuildTaskManagerCACertUnreadable(t *testing.T) {
	_, err := buildTaskManager(ServerConfig{
		RedisURL:        "rediss://127.0.0.1:6379",
		RedisCACertPath: filepath.Join(t.TempDir(), "missing.crt"),
	}, &Handler{})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "read redis CA cert")
}

// TestBuildTaskManagerCACertInvalidPEM: a rediss:// URL with a CA file containing no valid PEM
// certificates fails on parse, before any connection attempt.
func TestBuildTaskManagerCACertInvalidPEM(t *testing.T) {
	caPath := filepath.Join(t.TempDir(), "ca.crt")
	require.NoError(t, os.WriteFile(caPath, []byte("not a certificate"), 0o600))

	_, err := buildTaskManager(ServerConfig{
		RedisURL:        "rediss://127.0.0.1:6379",
		RedisCACertPath: caPath,
	}, &Handler{})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "no valid certificates")
}

// TestBuildTaskManagerCACertValid: a rediss:// URL with a valid CA applies it to the client's
// RootCAs (the applyRedisCACert success path) and only then attempts the connection — so an
// unreachable host fails at the ping, not at CA setup. Backoff is shortened to stay fast.
func TestBuildTaskManagerCACertValid(t *testing.T) {
	orig := redisConnectBackoff
	redisConnectBackoff = time.Millisecond
	defer func() { redisConnectBackoff = orig }()

	caPath := filepath.Join(t.TempDir(), "ca.crt")
	require.NoError(t, os.WriteFile(caPath, testCACertPEM(t), 0o600))

	_, err := buildTaskManager(ServerConfig{
		RedisURL:        "rediss://127.0.0.1:1",
		RedisCACertPath: caPath,
	}, &Handler{})
	require.Error(t, err)
	// Reaching the retry/ping error proves CA application succeeded (no CA error returned).
	assert.Contains(t, err.Error(), "after 3 attempts")
}

// TestNewServerMemory covers NewServer's happy path: with no Redis configured it builds the
// in-memory task manager and A2A server and starts ready. Providers are only stored (not
// invoked) during construction, so nil interfaces are fine here.
func TestNewServerMemory(t *testing.T) {
	s, err := NewServer(nil, nil, nil, ServerConfig{Addr: ":9090"})
	require.NoError(t, err)
	require.NotNil(t, s)
	assert.True(t, s.ready.Load(), "server must start ready")

	// Readiness probe reflects the initial ready state.
	rr := httptest.NewRecorder()
	s.handleReady(rr, httptest.NewRequest(http.MethodGet, "/ready", nil))
	assert.Equal(t, http.StatusOK, rr.Code)

	// Clean up the shutdown context created in NewServer.
	require.NoError(t, s.Stop(context.Background()))
}

// TestServerStartInvalidAddr covers Start: it wires the mux and http.Server, then returns the
// listen error immediately for an invalid address (no blocking on a live listener).
func TestServerStartInvalidAddr(t *testing.T) {
	s, err := NewServer(nil, nil, nil, ServerConfig{Addr: "127.0.0.1:-1"})
	require.NoError(t, err)

	err = s.Start()
	require.Error(t, err)
	assert.NotErrorIs(t, err, http.ErrServerClosed)

	require.NoError(t, s.Stop(context.Background()))
}

// testCACertPEM generates a minimal self-signed CA certificate in PEM form for TLS trust tests.
func testCACertPEM(t *testing.T) []byte {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	tmpl := &x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: "test-redis-ca"},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(time.Hour),
		IsCA:                  true,
		KeyUsage:              x509.KeyUsageCertSign,
		BasicConstraintsValid: true,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	require.NoError(t, err)
	return pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
}

// TestMergeShutdown covers the context-merge used per request: the child cancels on
// either the request context or the server lifetime context, and the returned cancel
// releases the AfterFunc registration.
func TestMergeShutdown(t *testing.T) {
	t.Run("server shutdown cancels child", func(t *testing.T) {
		serverCtx, serverCancel := context.WithCancel(context.Background())
		defer serverCancel()

		ctx, cancel := mergeShutdown(context.Background(), serverCtx)
		defer cancel()

		require.NoError(t, ctx.Err())
		serverCancel()
		select {
		case <-ctx.Done():
			assert.ErrorIs(t, ctx.Err(), context.Canceled)
		case <-time.After(time.Second):
			t.Fatal("child ctx not cancelled on server shutdown")
		}
	})

	t.Run("request cancel cancels child", func(t *testing.T) {
		serverCtx, serverCancel := context.WithCancel(context.Background())
		defer serverCancel()
		reqCtx, reqCancel := context.WithCancel(context.Background())

		ctx, cancel := mergeShutdown(reqCtx, serverCtx)
		defer cancel()

		reqCancel()
		select {
		case <-ctx.Done():
			assert.ErrorIs(t, ctx.Err(), context.Canceled)
		case <-time.After(time.Second):
			t.Fatal("child ctx not cancelled on request cancel")
		}
	})

	t.Run("nil server ctx", func(t *testing.T) {
		ctx, cancel := mergeShutdown(context.Background(), nil)
		require.NotNil(t, ctx)
		require.NoError(t, ctx.Err())
		cancel()
		assert.ErrorIs(t, ctx.Err(), context.Canceled)
	})
}
