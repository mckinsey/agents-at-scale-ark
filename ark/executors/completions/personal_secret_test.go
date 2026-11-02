package completions

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
	"sigs.k8s.io/controller-runtime/pkg/client/interceptor"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/labels"
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
			ObjectMeta: metav1.ObjectMeta{Name: "github-mcp", Namespace: "default", Labels: map[string]string{"app": "github", labels.NameLabel: "github-mcp"}},
		},
		&arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: "copycat-mcp", Namespace: "default", Labels: map[string]string{"app": "github", labels.NameLabel: "github-mcp"}},
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
		LabelSelector: &metav1.LabelSelector{MatchLabels: map[string]string{labels.NameLabel: "github-mcp"}},
		Headers:       []arkv1alpha1.Header{personalSecretHeader()},
	}
}

func legacySecretHeader() arkv1alpha1.Header {
	header := personalSecretHeader()
	header.Value.ValueFrom.SecretKeyRef.Name = "legacy"
	return header
}

func interceptedTestClient(get func(ctx context.Context, c client.WithWatch, key client.ObjectKey, obj client.Object, opts ...client.GetOption) error) client.Client {
	scheme := runtime.NewScheme()
	_ = corev1.AddToScheme(scheme)
	_ = arkv1alpha1.AddToScheme(scheme)
	return fake.NewClientBuilder().
		WithScheme(scheme).
		WithObjects(personalSecretTestObjects()...).
		WithInterceptorFuncs(interceptor.Funcs{Get: get}).
		Build()
}

func broadPersonalOverride() arkv1alpha1.Override {
	override := personalSecretOverride(OverrideTypeMCPServer)
	override.LabelSelector = &metav1.LabelSelector{MatchLabels: map[string]string{"app": "github"}}
	return override
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

	t.Run("personal secret reaches only the server with that name, not one that copied its label", func(t *testing.T) {
		got, err := ResolveHeadersFromOverrides(ctx, setupTestClient(personalSecretTestObjects()),
			[]arkv1alpha1.Override{personalSecretOverride(OverrideTypeMCPServer)}, "default", OverrideTypeMCPServer, secretscope.AllowPersonal)
		require.NoError(t, err)
		require.NotContains(t, got, "copycat-mcp")
	})

	broadSelectors := map[string]*metav1.LabelSelector{
		"no selector":            nil,
		"another label":          {MatchLabels: map[string]string{"app": "github"}},
		"name and another label": {MatchLabels: map[string]string{labels.NameLabel: "github-mcp", "app": "github"}},
		"empty name":             {MatchLabels: map[string]string{labels.NameLabel: ""}},
		"match expressions": {
			MatchLabels:      map[string]string{labels.NameLabel: "github-mcp"},
			MatchExpressions: []metav1.LabelSelectorRequirement{{Key: "app", Operator: metav1.LabelSelectorOpExists}},
		},
	}
	for name, selector := range broadSelectors {
		t.Run("personal secret with "+name+" is refused", func(t *testing.T) {
			override := personalSecretOverride(OverrideTypeMCPServer)
			override.LabelSelector = selector
			got, err := ResolveHeadersFromOverrides(ctx, setupTestClient(personalSecretTestObjects()),
				[]arkv1alpha1.Override{override}, "default", OverrideTypeMCPServer, secretscope.AllowPersonal)
			require.ErrorIs(t, err, secretscope.ErrPersonalSecretSelector)
			require.NotContains(t, err.Error(), personalSecretValue)
			require.Nil(t, got)
		})
	}

	t.Run("a secret that is not personal keeps any selector", func(t *testing.T) {
		override := arkv1alpha1.Override{
			ResourceType:  string(OverrideTypeMCPServer),
			LabelSelector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": "github"}},
			Headers:       []arkv1alpha1.Header{legacySecretHeader()},
		}
		got, err := ResolveHeadersFromOverrides(ctx, setupTestClient(personalSecretTestObjects()),
			[]arkv1alpha1.Override{override}, "default", OverrideTypeMCPServer, secretscope.AllowPersonal)
		require.NoError(t, err)
		require.Equal(t, map[string]map[string]string{
			"github-mcp":  {"Authorization": "legacy-token"},
			"copycat-mcp": {"Authorization": "legacy-token"},
		}, got)
	})

	t.Run("headers that are not secrets keep any selector", func(t *testing.T) {
		objects := append(personalSecretTestObjects(), &corev1.ConfigMap{
			ObjectMeta: metav1.ObjectMeta{Name: "settings", Namespace: "default"},
			Data:       map[string]string{"team": "platform"},
		})
		override := arkv1alpha1.Override{
			ResourceType:  string(OverrideTypeMCPServer),
			LabelSelector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": "github"}},
			Headers: []arkv1alpha1.Header{{
				Name: "X-Team",
				Value: arkv1alpha1.HeaderValue{ValueFrom: &arkv1alpha1.HeaderValueSource{
					ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
						LocalObjectReference: corev1.LocalObjectReference{Name: "settings"},
						Key:                  "team",
					},
				}},
			}},
		}
		got, err := ResolveHeadersFromOverrides(ctx, setupTestClient(objects),
			[]arkv1alpha1.Override{override}, "default", OverrideTypeMCPServer, secretscope.AllowPersonal)
		require.NoError(t, err)
		require.Contains(t, got, "github-mcp")
		require.Contains(t, got, "copycat-mcp")
	})

	t.Run("a missing secret fails as not found, not as an unreadable one", func(t *testing.T) {
		override := personalSecretOverride(OverrideTypeMCPServer)
		missing := legacySecretHeader()
		missing.Value.ValueFrom.SecretKeyRef.Name = "missing"
		override.Headers = append([]arkv1alpha1.Header{missing}, override.Headers...)
		_, err := ResolveHeadersFromOverrides(ctx, setupTestClient(personalSecretTestObjects()),
			[]arkv1alpha1.Override{override}, "default", OverrideTypeMCPServer, secretscope.AllowPersonal)
		require.ErrorContains(t, err, "not found")
		require.NotContains(t, err.Error(), "failed to read secret")
	})

	t.Run("a secret that cannot be read fails the override", func(t *testing.T) {
		forbidden := func(ctx context.Context, c client.WithWatch, key client.ObjectKey, obj client.Object, opts ...client.GetOption) error {
			if _, ok := obj.(*corev1.Secret); ok {
				return apierrors.NewForbidden(schema.GroupResource{Resource: "secrets"}, key.Name, nil)
			}
			return c.Get(ctx, key, obj, opts...)
		}
		got, err := ResolveHeadersFromOverrides(ctx, interceptedTestClient(forbidden),
			[]arkv1alpha1.Override{broadPersonalOverride()}, "default", OverrideTypeMCPServer, secretscope.AllowPersonal)
		require.ErrorContains(t, err, "failed to read secret")
		require.Nil(t, got)
	})

	t.Run("a secret that turns personal after the check is refused", func(t *testing.T) {
		reads := 0
		flip := func(ctx context.Context, c client.WithWatch, key client.ObjectKey, obj client.Object, opts ...client.GetOption) error {
			if err := c.Get(ctx, key, obj, opts...); err != nil {
				return err
			}
			if secret, ok := obj.(*corev1.Secret); ok && key.Name == personalSecretName {
				reads++
				if reads == 1 {
					secret.Labels = nil
				}
			}
			return nil
		}
		got, err := ResolveHeadersFromOverrides(ctx, interceptedTestClient(flip),
			[]arkv1alpha1.Override{broadPersonalOverride()}, "default", OverrideTypeMCPServer, secretscope.AllowPersonal)
		requirePersonalSecretRejected(t, err)
		require.Nil(t, got)
	})

	t.Run("a personal secret for a name no server carries fails the query", func(t *testing.T) {
		override := personalSecretOverride(OverrideTypeMCPServer)
		override.LabelSelector = &metav1.LabelSelector{MatchLabels: map[string]string{labels.NameLabel: "gone"}}
		got, err := ResolveHeadersFromOverrides(ctx, setupTestClient(personalSecretTestObjects()),
			[]arkv1alpha1.Override{override}, "default", OverrideTypeMCPServer, secretscope.AllowPersonal)
		require.ErrorContains(t, err, "no MCPServer named gone")
		require.NotContains(t, err.Error(), personalSecretValue)
		require.Nil(t, got)
	})

	t.Run("without permission a broad selector still reports the personal secret", func(t *testing.T) {
		_, err := ResolveHeadersFromOverrides(ctx, setupTestClient(personalSecretTestObjects()),
			[]arkv1alpha1.Override{broadPersonalOverride()}, "default", OverrideTypeMCPServer, secretscope.RejectPersonal)
		requirePersonalSecretRejected(t, err)
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
