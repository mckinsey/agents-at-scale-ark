package a2a

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestSharedA2ASendClientDoesNotCapContextDeadline(t *testing.T) {
	require.Zero(t, sharedA2ASendClient.Timeout,
		"http.Client.Timeout bounds every exchange regardless of context, so it would cap a caller that asked for longer via Query.spec.timeout")
	require.IsType(t, &backstopTransport{}, sharedA2ASendClient.Transport,
		"the backstop must be applied per-request so it only covers deadline-less callers")
}

type recordingRoundTripper struct {
	deadline    time.Time
	hasDeadline bool
	ctx         context.Context
	body        io.ReadCloser
	err         error
}

func (rt *recordingRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	rt.ctx = req.Context()
	rt.deadline, rt.hasDeadline = req.Context().Deadline()
	if rt.err != nil {
		return nil, rt.err
	}

	body := rt.body
	if body == nil {
		body = io.NopCloser(strings.NewReader(""))
	}
	return &http.Response{StatusCode: http.StatusOK, Body: body}, nil
}

func TestBackstopTransportLeavesCallerDeadlineUntouched(t *testing.T) {
	recorder := &recordingRoundTripper{}
	transport := &backstopTransport{base: recorder, backstop: 30 * time.Minute}

	callerDeadline := time.Now().Add(time.Hour)
	ctx, cancel := context.WithDeadline(t.Context(), callerDeadline)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://example.invalid", nil)
	require.NoError(t, err)

	resp, err := transport.RoundTrip(req)
	require.NoError(t, err)
	require.NoError(t, resp.Body.Close())

	require.True(t, recorder.hasDeadline)
	require.WithinDuration(t, callerDeadline, recorder.deadline, time.Second,
		"a caller asking for an hour must not be cut to the backstop")
}

func TestBackstopTransportBoundsDeadlinelessRequest(t *testing.T) {
	recorder := &recordingRoundTripper{}
	transport := &backstopTransport{base: recorder, backstop: 30 * time.Minute}

	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, "http://example.invalid", nil)
	require.NoError(t, err)

	resp, err := transport.RoundTrip(req)
	require.NoError(t, err)

	require.True(t, recorder.hasDeadline, "a request with no deadline must pick up the backstop")
	require.WithinDuration(t, time.Now().Add(30*time.Minute), recorder.deadline, time.Minute)

	require.NoError(t, recorder.ctx.Err(), "the deadline must outlive RoundTrip to cover the body read")
	require.NoError(t, resp.Body.Close())
	require.ErrorIs(t, recorder.ctx.Err(), context.Canceled, "closing the body must release the context")
}

func TestBackstopTransportReleasesContextOnError(t *testing.T) {
	recorder := &recordingRoundTripper{err: errors.New("dial failed")}
	transport := &backstopTransport{base: recorder, backstop: 30 * time.Minute}

	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, "http://example.invalid", nil)
	require.NoError(t, err)

	resp, err := transport.RoundTrip(req)
	if resp != nil {
		defer func() { _ = resp.Body.Close() }()
	}
	require.Error(t, err)
	require.Nil(t, resp)
	require.ErrorIs(t, recorder.ctx.Err(), context.Canceled)
}

func TestSharedA2ASendClientHonoursContextDeadline(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))
	t.Cleanup(server.Close)

	ctx, cancel := context.WithTimeout(t.Context(), 200*time.Millisecond)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, server.URL, nil)
	require.NoError(t, err)

	start := time.Now()
	resp, err := sharedA2ASendClient.Do(req)
	if resp != nil {
		_ = resp.Body.Close()
	}

	require.ErrorIs(t, err, context.DeadlineExceeded)
	require.Less(t, time.Since(start), 30*time.Second)
}
