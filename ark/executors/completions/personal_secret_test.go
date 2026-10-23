package completions

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"sigs.k8s.io/controller-runtime/pkg/client"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/secretscope"
)

const (
	personalSecretName  = "u-0123456789abcdef-github"
	personalSecretValue = "personal-token-value"
)

func personalSecretTestObjects() []client.Object {
	return []client.Object{
		&corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{
				Name:      personalSecretName,
				Namespace: "default",
				Labels: map[string]string{
					secretscope.ResourceTypeLabel: secretscope.SecretResourceType,
					secretscope.ScopeLabel:        "user-0123456789abcdef",
				},
			},
			Data: map[string][]byte{"token": []byte(personalSecretValue)},
		},
		&corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{Name: "legacy", Namespace: "default"},
			Data:       map[string][]byte{"token": []byte("legacy-token")},
		},
		&arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: "github-mcp", Namespace: "default", Labels: map[string]string{"app": "github"}},
		},
		&arkv1alpha1.Model{
			ObjectMeta: metav1.ObjectMeta{Name: "gpt", Namespace: "default", Labels: map[string]string{"app": "github"}},
		},
	}
}

func personalSecretHeader() arkv1alpha1.Header {
	return arkv1alpha1.Header{
		Name: "Authorization",
		Value: arkv1alpha1.HeaderValue{
			ValueFrom: &arkv1alpha1.HeaderValueSource{
				SecretKeyRef: &corev1.SecretKeySelector{
					LocalObjectReference: corev1.LocalObjectReference{Name: personalSecretName},
					Key:                  "token",
				},
			},
		},
	}
}

func personalSecretOverride(resourceType OverrideType) arkv1alpha1.Override {
	return arkv1alpha1.Override{
		ResourceType:  string(resourceType),
		LabelSelector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": "github"}},
		Headers:       []arkv1alpha1.Header{personalSecretHeader()},
	}
}

func requirePersonalSecretRejected(t *testing.T, err error) {
	t.Helper()
	require.ErrorIs(t, err, secretscope.ErrPersonalSecret)
	require.NotContains(t, err.Error(), personalSecretValue)
}

func TestResolveHeadersFromOverridesPersonalSecrets(t *testing.T) {
	ctx := context.Background()

	t.Run("mcpserver override with permission resolves personal secret", func(t *testing.T) {
		got, err := ResolveHeadersFromOverrides(ctx, setupTestClient(personalSecretTestObjects()),
			[]arkv1alpha1.Override{personalSecretOverride(OverrideTypeMCPServer)}, "default", OverrideTypeMCPServer, secretscope.AllowPersonal)
		require.NoError(t, err)
		require.Equal(t, map[string]map[string]string{"github-mcp": {"Authorization": personalSecretValue}}, got)
	})

	t.Run("mcpserver override without permission rejects personal secret", func(t *testing.T) {
		got, err := ResolveHeadersFromOverrides(ctx, setupTestClient(personalSecretTestObjects()),
			[]arkv1alpha1.Override{personalSecretOverride(OverrideTypeMCPServer)}, "default", OverrideTypeMCPServer, secretscope.RejectPersonal)
		requirePersonalSecretRejected(t, err)
		require.Nil(t, got)
	})

	t.Run("model override rejects personal secret even with permission", func(t *testing.T) {
		got, err := ResolveHeadersFromOverrides(ctx, setupTestClient(personalSecretTestObjects()),
			[]arkv1alpha1.Override{personalSecretOverride(OverrideTypeModel)}, "default", OverrideTypeModel, secretscope.AllowPersonal)
		requirePersonalSecretRejected(t, err)
		require.Nil(t, got)
	})
}

func TestResolveMCPSettingsForAgentPersonalSecrets(t *testing.T) {
	ctx := context.Background()
	agent := &arkv1alpha1.Agent{ObjectMeta: metav1.ObjectMeta{Name: "agent", Namespace: "default"}}
	query := &arkv1alpha1.Query{ObjectMeta: metav1.ObjectMeta{Name: "query", Namespace: "default"}}

	t.Run("query mcpserver override resolves personal secret", func(t *testing.T) {
		q := query.DeepCopy()
		q.Spec.Overrides = []arkv1alpha1.Override{personalSecretOverride(OverrideTypeMCPServer)}

		settings, err := resolveMCPSettingsForAgent(ctx, setupTestClient(personalSecretTestObjects()), agent, q, nil)
		require.NoError(t, err)
		require.Equal(t, personalSecretValue, settings["default/github-mcp"].Headers["Authorization"])
	})

	t.Run("agent mcpserver override rejects personal secret", func(t *testing.T) {
		a := agent.DeepCopy()
		a.Spec.Overrides = []arkv1alpha1.Override{personalSecretOverride(OverrideTypeMCPServer)}

		_, err := resolveMCPSettingsForAgent(ctx, setupTestClient(personalSecretTestObjects()), a, query, nil)
		requirePersonalSecretRejected(t, err)
	})

	t.Run("query model override rejects personal secret", func(t *testing.T) {
		q := query.DeepCopy()
		q.Spec.Overrides = []arkv1alpha1.Override{personalSecretOverride(OverrideTypeModel)}
		a := agent.DeepCopy()
		a.Spec.ModelRef = &arkv1alpha1.AgentModelRef{Name: "gpt"}

		_, err := resolveModelHeadersForAgent(ctx, setupTestClient(personalSecretTestObjects()), a, q)
		requirePersonalSecretRejected(t, err)
	})
}

func TestResolveHeadersRejectsPersonalSecret(t *testing.T) {
	got, err := ResolveHeaders(context.Background(), setupTestClient(personalSecretTestObjects()),
		[]arkv1alpha1.Header{personalSecretHeader()}, "default")
	requirePersonalSecretRejected(t, err)
	require.Nil(t, got)
}

func TestHTTPExecutorResolveHeaderValueRejectsPersonalSecret(t *testing.T) {
	h := &HTTPExecutor{K8sClient: setupTestClient(personalSecretTestObjects())}

	value, err := h.resolveHeaderValue(context.Background(), personalSecretHeader().Value, "default")
	requirePersonalSecretRejected(t, err)
	require.Empty(t, value)

	legacy := personalSecretHeader().Value
	legacy.ValueFrom.SecretKeyRef.Name = "legacy"
	value, err = h.resolveHeaderValue(context.Background(), legacy, "default")
	require.NoError(t, err)
	require.Equal(t, "legacy-token", value)
}

func TestAgentResolvePromptRejectsPersonalSecretParameter(t *testing.T) {
	agent := &Agent{
		Name:      "agent",
		Namespace: "default",
		Prompt:    "token {{.token}}",
		Parameters: []arkv1alpha1.Parameter{{
			Name:      "token",
			ValueFrom: &arkv1alpha1.ValueFromSource{SecretKeyRef: personalSecretHeader().Value.ValueFrom.SecretKeyRef},
		}},
		client: setupTestClient(personalSecretTestObjects()),
	}

	prompt, err := agent.resolvePrompt(context.Background())
	requirePersonalSecretRejected(t, err)
	require.Empty(t, prompt)
}

func TestQueryParameterRejectsPersonalSecret(t *testing.T) {
	value, err := resolveQueryValueFrom(context.Background(), setupTestClient(personalSecretTestObjects()), "default",
		&arkv1alpha1.ValueFromSource{SecretKeyRef: personalSecretHeader().Value.ValueFrom.SecretKeyRef})
	requirePersonalSecretRejected(t, err)
	require.Empty(t, value)
}

func TestCreateMCPExecutorRejectsPersonalSecretHeader(t *testing.T) {
	objects := append(personalSecretTestObjects(), &arkv1alpha1.MCPServer{
		ObjectMeta: metav1.ObjectMeta{Name: "personal-headers", Namespace: "default"},
		Spec: arkv1alpha1.MCPServerSpec{
			Address: arkv1alpha1.ValueSource{Value: "http://127.0.0.1:1/mcp"},
			Headers: []arkv1alpha1.Header{personalSecretHeader()},
		},
	})
	tool := &arkv1alpha1.Tool{
		ObjectMeta: metav1.ObjectMeta{Name: "echo", Namespace: "default"},
		Spec: arkv1alpha1.ToolSpec{
			Type: "mcp",
			MCP:  &arkv1alpha1.MCPToolRef{MCPServerRef: arkv1alpha1.MCPServerRef{Name: "personal-headers"}, ToolName: "echo"},
		},
	}

	executor, err := createMCPExecutor(context.Background(), setupTestClient(objects), tool, "default", nil, nil)
	requirePersonalSecretRejected(t, err)
	require.Nil(t, executor)
}

func TestResolveModelHeadersRejectsPersonalSecret(t *testing.T) {
	got, err := resolveModelHeaders(context.Background(), setupTestClient(personalSecretTestObjects()),
		[]arkv1alpha1.Header{personalSecretHeader()}, "default")
	requirePersonalSecretRejected(t, err)
	require.Nil(t, got)
}
