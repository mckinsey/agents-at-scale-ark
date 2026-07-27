package controller

import (
	"context"
	"strings"
	"sync"
	"testing"

	"github.com/go-logr/logr"
	"github.com/go-logr/logr/funcr"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	eventingconfig "mckinsey.com/ark/internal/eventing/config"
	telemetryconfig "mckinsey.com/ark/internal/telemetry/config"
)

// newCapturingLogger returns a logr.Logger that records every emitted JSON log
// line into the returned slice. funcr's JSON output includes an "error" key on
// Error-level logs, which lets the tests assert the operator sees a
// level=error line (not just an Info line) on the query failure paths.
func newCapturingLogger() (logr.Logger, *[]string) {
	var mu sync.Mutex
	lines := &[]string{}
	logger := funcr.NewJSON(func(obj string) {
		mu.Lock()
		defer mu.Unlock()
		*lines = append(*lines, obj)
	}, funcr.Options{})
	return logger, lines
}

func TestHandleQueryDispatchLogsErrors(t *testing.T) {
	newReconciler := func(objs ...client.Object) *QueryReconciler {
		return &QueryReconciler{
			Client:    fake.NewClientBuilder().WithScheme(newTestScheme()).WithObjects(objs...).Build(),
			Telemetry: telemetryconfig.NewProvider(context.Background(), nil),
			Eventing:  eventingconfig.NewProviderWithClient(context.Background(), nil),
		}
	}

	t.Run("resolve-target failure emits an error log", func(t *testing.T) {
		r := newReconciler()
		logger, lines := newCapturingLogger()
		ctx := logf.IntoContext(context.Background(), logger)
		_, span := r.Telemetry.Tracer().Start(ctx, "test")

		// No target and no selector: resolveTarget fails immediately.
		obj := &arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "no-target-query", Namespace: "default"},
		}

		err := r.handleQueryDispatch(ctx, obj, span, r.Client)
		require.Error(t, err)

		joined := strings.Join(*lines, "\n")
		assert.Contains(t, joined, "query execution failed")
		assert.Contains(t, joined, `"error"`, "log line should be level=error")
		assert.Contains(t, joined, "no-target-query")
		assert.Contains(t, joined, `"namespace":"default"`)
		assert.Contains(t, joined, `"stage":"resolve-target"`)
	})

	t.Run("resolve-dispatch-address failure emits an error log", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{Name: "engine-agent", Namespace: "default"},
			Spec: arkv1alpha1.AgentSpec{
				ExecutionEngine: &arkv1alpha1.ExecutionEngineRef{Name: "missing-engine"},
			},
		}
		r := newReconciler(agent)
		logger, lines := newCapturingLogger()
		ctx := logf.IntoContext(context.Background(), logger)
		_, span := r.Telemetry.Tracer().Start(ctx, "test")

		obj := &arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "bad-engine-query", Namespace: "default"},
			Spec: arkv1alpha1.QuerySpec{
				Target: &arkv1alpha1.QueryTarget{Type: targetTypeAgent, Name: "engine-agent"},
			},
		}

		err := r.handleQueryDispatch(ctx, obj, span, r.Client)
		require.Error(t, err)

		joined := strings.Join(*lines, "\n")
		assert.Contains(t, joined, "query execution failed")
		assert.Contains(t, joined, `"error"`, "log line should be level=error")
		assert.Contains(t, joined, "bad-engine-query")
		assert.Contains(t, joined, `"stage":"resolve-dispatch-address"`)
	})
}
