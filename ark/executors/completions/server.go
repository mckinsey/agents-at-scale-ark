package completions

import (
	"context"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"sync/atomic"
	"time"

	"github.com/redis/go-redis/v9"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	"trpc.group/trpc-go/trpc-a2a-go/server"
	"trpc.group/trpc-go/trpc-a2a-go/taskmanager"
	redistm "trpc.group/trpc-go/trpc-a2a-go/taskmanager/redis"

	"mckinsey.com/ark/internal/eventing"
	"mckinsey.com/ark/internal/telemetry"
)

var log = logf.Log.WithName("queryengine")

// finalizeGrace is the short window granted, after the drain deadline is hit, for
// lingering executions to finalize their event stream before the process exits. The
// pod's terminationGracePeriodSeconds must budget for preStop + --shutdown-timeout +
// finalizeGrace + buffer so this window never pushes shutdown past the SIGKILL (see the
// chart's gracefulShutdown values). Var (not const) so tests can shorten it.
var finalizeGrace = 2 * time.Second

// Redis connection retry at boot. A shared-Redis blip (failover/restart) must not
// crashloop the whole fleet synchronously, so tolerate transient unavailability with a
// bounded retry before failing startup. Kept well inside the liveness failure budget.
const redisConnectAttempts = 3

// redisConnectBackoff is a var (not const) so tests can shorten it.
var redisConnectBackoff = 2 * time.Second

// ServerConfig configures the completions server, including how A2A task state is stored.
type ServerConfig struct {
	Addr string

	// RedisURL, when non-empty, selects the shared Redis-backed A2A TaskManager so task
	// state (status/history/artifacts) is visible across replicas — required for external
	// A2A clients doing tasks/get, tasks/resubscribe, or stream re-attach under HPA-driven
	// multi-pod deployments. Empty falls back to the per-process in-memory TaskManager,
	// which is correct for single-pod installs and the controller's blocking dispatch path.
	RedisURL string
	// RedisPassword, when set, overrides any password embedded in RedisURL.
	RedisPassword string
	// RedisCACertPath, when set, points to a PEM CA bundle trusted for the rediss:// Redis
	// connection. It is appended to a clone of the system trust store and applied to the Redis
	// client's TLS config ONLY — so a private/self-signed Redis CA can be trusted without
	// touching the system roots the executor needs for outbound HTTPS (LLM providers). Requires
	// a rediss:// URL. Public/system-trusted CAs need no path; rediss:// works without it.
	RedisCACertPath string
	// TaskExpiry bounds how long task/conversation state lives in Redis (0 = library default).
	TaskExpiry time.Duration
}

type Server struct {
	a2aServer  *server.A2AServer
	httpServer *http.Server
	addr       string

	// ready gates the readiness probe. It is flipped to false at the start of shutdown so
	// load balancers stop routing new requests to a terminating pod before in-flight work
	// is drained.
	ready atomic.Bool

	// shutdownCancel cancels the server lifetime context once the drain window closes,
	// signalling any lingering in-flight executions (notably long-lived streams) to stop
	// and run their finalize path — closing the stream cleanly — instead of being severed
	// on process exit.
	shutdownCancel context.CancelFunc
}

// applyRedisCACert trusts a private/self-signed Redis CA for the rediss:// connection only.
// The CA is appended to a clone of the system trust store (x509.SystemCertPool returns a copy)
// and set as the Redis client's RootCAs, so outbound HTTPS to LLM providers keeps using the
// unmodified system roots — unlike SSL_CERT_FILE/customCACert, which would replace them.
func applyRedisCACert(opt *redis.Options, path string) error {
	if opt.TLSConfig == nil {
		return fmt.Errorf("redis CA cert configured but URL is not rediss:// (TLS): %s", path)
	}
	caPEM, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read redis CA cert %q: %w", path, err)
	}
	pool, err := x509.SystemCertPool()
	if err != nil || pool == nil {
		pool = x509.NewCertPool()
	}
	if !pool.AppendCertsFromPEM(caPEM) {
		return fmt.Errorf("no valid certificates found in redis CA cert %q", path)
	}
	opt.TLSConfig.RootCAs = pool
	log.Info("using custom CA for redis TLS", "path", path)
	return nil
}

// buildTaskManager selects the A2A task manager based on config: a shared Redis-backed
// manager when a Redis URL is provided, otherwise the in-memory manager.
func buildTaskManager(cfg ServerConfig, processor taskmanager.MessageProcessor) (taskmanager.TaskManager, error) {
	if cfg.RedisURL == "" {
		log.Info("using in-memory A2A task manager; set redis to share task state across replicas")
		return taskmanager.NewMemoryTaskManager(processor)
	}

	opt, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return nil, fmt.Errorf("invalid redis URL: %w", err)
	}
	if cfg.RedisPassword != "" {
		opt.Password = cfg.RedisPassword
	}
	if cfg.RedisCACertPath != "" {
		if err := applyRedisCACert(opt, cfg.RedisCACertPath); err != nil {
			return nil, err
		}
	}
	redisClient := redis.NewClient(opt)

	var opts []redistm.TaskManagerOption
	if cfg.TaskExpiry > 0 {
		opts = append(opts, redistm.WithExpireTime(cfg.TaskExpiry))
	}

	// NewTaskManager pings Redis synchronously and hard-fails if it is unreachable. Retry
	// with backoff so a transient blip at boot doesn't crashloop every replica at once; a
	// permanent misconfig still fails fast after the bounded attempts.
	var tm taskmanager.TaskManager
	var lastErr error
	for attempt := 1; attempt <= redisConnectAttempts; attempt++ {
		tm, lastErr = redistm.NewTaskManager(redisClient, processor, opts...)
		if lastErr == nil {
			break
		}
		log.Error(lastErr, "redis task manager init failed", "attempt", attempt, "maxAttempts", redisConnectAttempts, "addr", opt.Addr)
		if attempt < redisConnectAttempts {
			time.Sleep(redisConnectBackoff)
		}
	}
	if lastErr != nil {
		return nil, fmt.Errorf("failed to create redis task manager after %d attempts: %w", redisConnectAttempts, lastErr)
	}
	log.Info("using redis-backed A2A task manager", "addr", opt.Addr, "db", opt.DB)
	return tm, nil
}

func NewServer(
	k8sClient client.Client,
	telemetryProvider telemetry.Provider,
	eventingProvider eventing.Provider,
	cfg ServerConfig,
) (*Server, error) {
	shutdownCtx, shutdownCancel := context.WithCancel(context.Background())

	handler := &Handler{
		k8sClient: k8sClient,
		telemetry: telemetryProvider,
		eventing:  eventingProvider,
		withShutdown: func(reqCtx context.Context) (context.Context, context.CancelFunc) {
			return mergeShutdown(reqCtx, shutdownCtx)
		},
	}

	tm, err := buildTaskManager(cfg, handler)
	if err != nil {
		shutdownCancel()
		return nil, err
	}

	agentCard := server.AgentCard{
		Name:               "ark-completions",
		Description:        "Ark built-in query execution engine",
		URL:                "http://localhost" + cfg.Addr,
		Version:            "1.0.0",
		DefaultInputModes:  []string{"text"},
		DefaultOutputModes: []string{"text"},
		Skills: []server.AgentSkill{
			{
				ID:   "query-execution",
				Name: "Query Execution",
				Tags: []string{"execution-engine"},
			},
		},
		Capabilities: server.AgentCapabilities{},
	}

	a2aSrv, err := server.NewA2AServer(agentCard, tm)
	if err != nil {
		shutdownCancel()
		return nil, err
	}

	s := &Server{
		a2aServer:      a2aSrv,
		addr:           cfg.Addr,
		shutdownCancel: shutdownCancel,
	}
	s.ready.Store(true)
	return s, nil
}

// handleHealth is the liveness probe: always healthy while the process is up.
func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "healthy"})
}

// handleReady is the readiness probe: reports not-ready during shutdown so the pod is
// removed from Service endpoints before in-flight requests are drained.
func (s *Server) handleReady(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if !s.ready.Load() {
		w.WriteHeader(http.StatusServiceUnavailable)
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "shutting-down"})
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ready"})
}

func (s *Server) Start() error {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/ready", s.handleReady)
	mux.Handle("/", otelhttp.NewHandler(s.a2aServer.Handler(), "executor.completions"))

	s.httpServer = &http.Server{
		Addr:    s.addr,
		Handler: mux,
	}

	return s.httpServer.ListenAndServe()
}

// SetNotReady flips the readiness probe to failing. main calls this on receipt of a
// termination signal, before Stop, so /ready reports not-ready as early as possible while
// in-flight work drains. Stop also flips it defensively as its first action.
func (s *Server) SetNotReady() {
	s.ready.Store(false)
}

func (s *Server) Stop(ctx context.Context) error {
	s.ready.Store(false)
	if s.httpServer == nil {
		s.shutdownCancel()
		return nil
	}

	// Shutdown stops accepting new connections and waits for in-flight requests to finish,
	// bounded by ctx. It does not cancel their request contexts.
	err := s.httpServer.Shutdown(ctx)

	// Drain window closed. Signal any still-running executions to stop and finalize.
	s.shutdownCancel()
	if errors.Is(err, context.DeadlineExceeded) {
		// Work was still in flight at the deadline: give the signalled executions a brief
		// window to close their streams cleanly before the process exits.
		time.Sleep(finalizeGrace)
	}
	return err
}
