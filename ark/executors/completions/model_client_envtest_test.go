package completions

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	clientgoscheme "k8s.io/client-go/kubernetes/scheme"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/envtest"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	eventnoop "mckinsey.com/ark/internal/eventing/noop"
	telenoop "mckinsey.com/ark/internal/telemetry/noop"
)

func TestNewModelCachingClient_ObservesModelUpdates(t *testing.T) {
	if os.Getenv("KUBEBUILDER_ASSETS") == "" {
		t.Skip("KUBEBUILDER_ASSETS is not set; run via make test")
	}

	testEnv := &envtest.Environment{
		CRDDirectoryPaths:     []string{filepath.Join("..", "..", "config", "crd", "bases")},
		ErrorIfCRDPathMissing: true,
	}
	restConfig, err := testEnv.Start()
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, testEnv.Stop()) })

	scheme := runtime.NewScheme()
	require.NoError(t, clientgoscheme.AddToScheme(scheme))
	require.NoError(t, arkv1alpha1.AddToScheme(scheme))

	writer, err := client.New(restConfig, client.Options{Scheme: scheme})
	require.NoError(t, err)

	name, ns := "envtest-model", "default"
	require.NoError(t, writer.Create(context.Background(), openAIModelWithBaseURL(name, ns, "http://old.example.com/v1")))

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	routed, err := NewModelCachingClient(ctx, restConfig, scheme, "")
	require.NoError(t, err)

	loadBaseURL := func() string {
		loaded, err := LoadModel(ctx, routed, &arkv1alpha1.AgentModelRef{Name: name, Namespace: ns},
			ns, nil, telenoop.NewModelRecorder(), eventnoop.NewModelRecorder())
		if err != nil {
			return ""
		}
		provider, ok := loaded.Provider.(*OpenAIProvider)
		if !ok {
			return ""
		}
		return provider.BaseURL
	}

	require.Eventually(t, func() bool { return loadBaseURL() == "http://old.example.com/v1" },
		20*time.Second, 100*time.Millisecond, "cached client should serve the created Model")

	var stored arkv1alpha1.Model
	require.NoError(t, writer.Get(context.Background(), types.NamespacedName{Name: name, Namespace: ns}, &stored))
	stored.Spec.Config.OpenAI.BaseURL = arkv1alpha1.ValueSource{Value: "http://new.example.com/v1"}
	require.NoError(t, writer.Update(context.Background(), &stored))

	require.Eventually(t, func() bool { return loadBaseURL() == "http://new.example.com/v1" },
		20*time.Second, 100*time.Millisecond, "cached client must observe the updated baseURL via its watch")
}
