/* Copyright 2025. McKinsey & Company */

package a2a

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
)

func engineTestScheme(t *testing.T) *runtime.Scheme {
	t.Helper()
	scheme := runtime.NewScheme()
	require.NoError(t, arkv1alpha1.AddToScheme(scheme))
	require.NoError(t, arkv1prealpha1.AddToScheme(scheme))
	return scheme
}

func TestIsNamedEngine(t *testing.T) {
	tests := []struct {
		name string
		ref  *arkv1alpha1.ExecutionEngineRef
		want bool
	}{
		{name: "nil ref", ref: nil, want: false},
		{name: "reserved a2a engine", ref: &arkv1alpha1.ExecutionEngineRef{Name: ExecutionEngineA2A}, want: false},
		{name: "empty name", ref: &arkv1alpha1.ExecutionEngineRef{Name: ""}, want: false},
		{name: "named engine", ref: &arkv1alpha1.ExecutionEngineRef{Name: "my-engine"}, want: true},
		{name: "named engine in another namespace", ref: &arkv1alpha1.ExecutionEngineRef{Name: "my-engine", Namespace: "other"}, want: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, IsNamedEngine(tt.ref))
		})
	}
}

func TestResolveExecutionEngineAddress(t *testing.T) {
	const engineAddr = "http://my-engine:9090"

	engine := func(namespace, addr string) *arkv1prealpha1.ExecutionEngine {
		return &arkv1prealpha1.ExecutionEngine{
			ObjectMeta: metav1.ObjectMeta{Name: "my-engine", Namespace: namespace},
			Status:     arkv1prealpha1.ExecutionEngineStatus{LastResolvedAddress: addr},
		}
	}

	t.Run("resolves address", func(t *testing.T) {
		k8sClient := fake.NewClientBuilder().WithScheme(engineTestScheme(t)).WithObjects(engine("default", engineAddr)).Build()

		addr, crd, err := ResolveExecutionEngineAddress(context.Background(), k8sClient,
			&arkv1alpha1.ExecutionEngineRef{Name: "my-engine"}, "default")

		require.NoError(t, err)
		assert.Equal(t, engineAddr, addr)
		require.NotNil(t, crd)
		assert.Equal(t, "my-engine", crd.Name)
	})

	t.Run("empty ref namespace defaults to the caller namespace", func(t *testing.T) {
		k8sClient := fake.NewClientBuilder().WithScheme(engineTestScheme(t)).WithObjects(engine("tenant-a", engineAddr)).Build()

		addr, _, err := ResolveExecutionEngineAddress(context.Background(), k8sClient,
			&arkv1alpha1.ExecutionEngineRef{Name: "my-engine"}, "tenant-a")

		require.NoError(t, err)
		assert.Equal(t, engineAddr, addr)
	})

	t.Run("explicit ref namespace wins over the caller namespace", func(t *testing.T) {
		k8sClient := fake.NewClientBuilder().WithScheme(engineTestScheme(t)).
			WithObjects(engine("engines", engineAddr), engine("default", "http://wrong:9090")).Build()

		addr, _, err := ResolveExecutionEngineAddress(context.Background(), k8sClient,
			&arkv1alpha1.ExecutionEngineRef{Name: "my-engine", Namespace: "engines"}, "default")

		require.NoError(t, err)
		assert.Equal(t, engineAddr, addr)
	})

	t.Run("engine not found", func(t *testing.T) {
		k8sClient := fake.NewClientBuilder().WithScheme(engineTestScheme(t)).Build()

		_, _, err := ResolveExecutionEngineAddress(context.Background(), k8sClient,
			&arkv1alpha1.ExecutionEngineRef{Name: "my-engine"}, "default")

		require.Error(t, err)
		assert.Contains(t, err.Error(), "execution engine my-engine not found in namespace default")
	})

	t.Run("address not yet resolved", func(t *testing.T) {
		k8sClient := fake.NewClientBuilder().WithScheme(engineTestScheme(t)).WithObjects(engine("default", "")).Build()

		_, _, err := ResolveExecutionEngineAddress(context.Background(), k8sClient,
			&arkv1alpha1.ExecutionEngineRef{Name: "my-engine"}, "default")

		require.Error(t, err)
		assert.Contains(t, err.Error(), "execution engine my-engine address not yet resolved")
	})
}
