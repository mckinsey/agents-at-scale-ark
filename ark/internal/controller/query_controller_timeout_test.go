package controller

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

type delayedA2AServer struct {
	*httptest.Server
	done chan struct{}
}

func newDelayedA2AServer(delay time.Duration) *delayedA2AServer {
	done := make(chan struct{})
	mux := http.NewServeMux()
	mux.HandleFunc("/.well-known/agent.json", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"name":               "test-agent",
			"url":                "http://localhost",
			"version":            "1.0.0",
			"defaultInputModes":  []string{"text"},
			"defaultOutputModes": []string{"text"},
			"capabilities":       map[string]any{},
			"skills":             []any{},
		})
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-time.After(delay):
		case <-r.Context().Done():
			return
		case <-done:
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0",
			"id":      1,
			"result": map[string]any{
				"role": "agent",
				"parts": []map[string]any{
					{"kind": "text", "text": "done"},
				},
				"kind": "message",
			},
		})
	})
	return &delayedA2AServer{Server: httptest.NewServer(mux), done: done}
}

func (s *delayedA2AServer) Shutdown() {
	close(s.done)
	s.Server.CloseClientConnections()
	s.Server.Close()
}

func TestSendQueryA2ARespectsQueryTimeout(t *testing.T) {
	t.Run("query timeout shorter than response delay causes timeout", func(t *testing.T) {
		srv := newDelayedA2AServer(10 * time.Second)
		defer srv.Shutdown()

		r := &QueryReconciler{
			Client: fake.NewClientBuilder().WithScheme(newTestScheme()).Build(),
		}

		query := arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "timeout-query", Namespace: "default"},
			Spec: arkv1alpha1.QuerySpec{
				Timeout: &metav1.Duration{Duration: 2 * time.Second},
				Target:  &arkv1alpha1.QueryTarget{Type: "agent", Name: "test"},
			},
		}
		_ = query.Spec.SetInputString("hello")

		target := arkv1alpha1.QueryTarget{Type: "agent", Name: "test"}
		start := time.Now()
		_, _, err := r.sendQueryA2A(context.Background(), srv.URL, query, target)
		elapsed := time.Since(start)

		require.Error(t, err)
		assert.Contains(t, err.Error(), "Client.Timeout exceeded")
		assert.Less(t, elapsed, 5*time.Second)
	})

	t.Run("query timeout longer than response delay succeeds", func(t *testing.T) {
		srv := newDelayedA2AServer(500 * time.Millisecond)
		defer srv.Shutdown()

		r := &QueryReconciler{
			Client: fake.NewClientBuilder().WithScheme(newTestScheme()).Build(),
		}

		query := arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "ok-query", Namespace: "default"},
			Spec: arkv1alpha1.QuerySpec{
				Timeout: &metav1.Duration{Duration: 10 * time.Second},
				Target:  &arkv1alpha1.QueryTarget{Type: "agent", Name: "test"},
			},
		}
		_ = query.Spec.SetInputString("hello")

		target := arkv1alpha1.QueryTarget{Type: "agent", Name: "test"}
		resp, _, err := r.sendQueryA2A(context.Background(), srv.URL, query, target)

		require.NoError(t, err)
		require.NotNil(t, resp)
	})

	t.Run("default 5m timeout used when query has no timeout", func(t *testing.T) {
		srv := newDelayedA2AServer(0)
		defer srv.Shutdown()

		r := &QueryReconciler{
			Client: fake.NewClientBuilder().WithScheme(newTestScheme()).Build(),
		}

		query := arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "default-timeout-query", Namespace: "default"},
			Spec: arkv1alpha1.QuerySpec{
				Target: &arkv1alpha1.QueryTarget{Type: "agent", Name: "test"},
			},
		}
		_ = query.Spec.SetInputString("hello")

		target := arkv1alpha1.QueryTarget{Type: "agent", Name: "test"}
		resp, _, err := r.sendQueryA2A(context.Background(), srv.URL, query, target)

		require.NoError(t, err)
		require.NotNil(t, resp)
	})
}
