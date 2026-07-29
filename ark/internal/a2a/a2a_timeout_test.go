package a2a

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestSharedA2ASendClientDoesNotCapContextDeadline(t *testing.T) {
	require.Equal(t, a2aSendBackstopTimeout, sharedA2ASendClient.Timeout)
	require.Greater(t, sharedA2ASendClient.Timeout, 5*time.Minute,
		"client timeout must stay above the 5m Query.spec.timeout default, or it caps the context deadline instead of backstopping it")
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
