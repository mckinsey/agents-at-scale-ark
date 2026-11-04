package completions

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	eventnoop "mckinsey.com/ark/internal/eventing/noop"
	"mckinsey.com/ark/internal/modelurl"
	telenoop "mckinsey.com/ark/internal/telemetry/noop"
)

const (
	baseURLConfigMap = "model-endpoint"
	baseURLKey       = "base-url"
	apiKeySecret     = "model-credentials"
	testModelName    = "m"
)

func allowTestServerBaseURLs(t *testing.T) {
	t.Helper()
	previous := validateModelBaseURL
	validateModelBaseURL = func(string) error { return nil }
	t.Cleanup(func() { validateModelBaseURL = previous })
}

func baseURLFromConfigMap() arkv1alpha1.ValueSource {
	return arkv1alpha1.ValueSource{ValueFrom: &arkv1alpha1.ValueFromSource{
		ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
			LocalObjectReference: corev1.LocalObjectReference{Name: baseURLConfigMap},
			Key:                  baseURLKey,
		},
	}}
}

func apiKeyFromSecret() arkv1alpha1.ValueSource {
	return arkv1alpha1.ValueSource{ValueFrom: &arkv1alpha1.ValueFromSource{
		SecretKeyRef: &corev1.SecretKeySelector{
			LocalObjectReference: corev1.LocalObjectReference{Name: apiKeySecret},
			Key:                  "token",
		},
	}}
}

func baseURLConfigMapObject(ns, baseURL string) *corev1.ConfigMap {
	return &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{Name: baseURLConfigMap, Namespace: ns},
		Data:       map[string]string{baseURLKey: baseURL},
	}
}

func modelWithConfigMapBaseURL(ns, provider string) *arkv1alpha1.Model {
	model := &arkv1alpha1.Model{
		ObjectMeta: metav1.ObjectMeta{Name: testModelName, Namespace: ns},
		Spec: arkv1alpha1.ModelSpec{
			Model:    arkv1alpha1.ValueSource{Value: "test-model"},
			Provider: provider,
		},
	}
	apiKey := apiKeyFromSecret()
	switch provider {
	case ProviderOpenAI:
		model.Spec.Config.OpenAI = &arkv1alpha1.OpenAIModelConfig{BaseURL: baseURLFromConfigMap(), APIKey: apiKey}
	case ProviderAzure:
		model.Spec.Config.Azure = &arkv1alpha1.AzureModelConfig{BaseURL: baseURLFromConfigMap(), APIKey: &apiKey}
	case ProviderAnthropic:
		model.Spec.Config.Anthropic = &arkv1alpha1.AnthropicModelConfig{BaseURL: baseURLFromConfigMap(), APIKey: apiKey}
	case ProviderBedrock:
		baseURL := baseURLFromConfigMap()
		accessKeyID := apiKeyFromSecret()
		secretAccessKey := apiKeyFromSecret()
		model.Spec.Config.Bedrock = &arkv1alpha1.BedrockModelConfig{
			Region:          &arkv1alpha1.ValueSource{Value: "us-east-1"},
			BaseURL:         &baseURL,
			AccessKeyID:     &accessKeyID,
			SecretAccessKey: &secretAccessKey,
			APIKey:          &apiKey,
		}
	}
	return model
}

func loadTestModel(ctx context.Context, c client.Client, ns string) (*Model, error) {
	return LoadModel(ctx, c, &arkv1alpha1.AgentModelRef{Name: testModelName, Namespace: ns}, ns, nil,
		telenoop.NewModelRecorder(), eventnoop.NewModelRecorder())
}

func TestLoadModelRejectsBaseURLFromConfigMap(t *testing.T) {
	ns := defaultNamespace
	tests := []struct {
		name      string
		provider  string
		baseURL   string
		whitelist string
		field     string
		rule      modelurl.Rule
	}{
		{"openai plain HTTP to loopback", ProviderOpenAI, "http://127.0.0.1:1", "", "spec.config.openai.baseUrl", modelurl.RuleHTTPS},
		{"openai private address", ProviderOpenAI, "https://10.0.0.5/v1", "", "spec.config.openai.baseUrl", modelurl.RulePrivateIP},
		{"openai metadata address", ProviderOpenAI, "https://169.254.169.254/v1", "", "spec.config.openai.baseUrl", modelurl.RuleLinkLocal},
		{"openai host outside the allowlist", ProviderOpenAI, "https://models.example.org/v1", "api.openai.com", "spec.config.openai.baseUrl", modelurl.RuleDomain},
		{"azure plain HTTP to an external host", ProviderAzure, "http://models.example.org", "", "spec.config.azure.baseUrl", modelurl.RuleHTTPS},
		{"anthropic loopback", ProviderAnthropic, "https://127.0.0.1", "", "spec.config.anthropic.baseUrl", modelurl.RuleLoopback},
		{"bedrock private address", ProviderBedrock, "https://192.168.1.10", "", "spec.config.bedrock.baseUrl", modelurl.RulePrivateIP},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv(modelurl.WhitelistedDomainsEnv, tt.whitelist)
			t.Setenv(modelurl.AllowedPrivateIPRangeEnv, "")
			c := setupModelTestClient([]client.Object{
				modelWithConfigMapBaseURL(ns, tt.provider),
				baseURLConfigMapObject(ns, tt.baseURL),
			})

			model, err := loadTestModel(context.Background(), c, ns)
			require.Nil(t, model)
			var notAllowed *BaseURLNotAllowedError
			require.ErrorAs(t, err, &notAllowed)
			require.Equal(t, tt.field, notAllowed.Field)
			require.Equal(t, tt.rule, notAllowed.Rule)
			require.Equal(t, tt.field+" is not allowed by the model URL policy: "+string(tt.rule), err.Error())
			require.NotContains(t, err.Error(), tt.baseURL)
		})
	}
}

func TestLoadModelAcceptsAllowedBaseURLFromConfigMap(t *testing.T) {
	ns := defaultNamespace
	t.Setenv(modelurl.WhitelistedDomainsEnv, "")
	t.Setenv(modelurl.AllowedPrivateIPRangeEnv, "10.100.0.0/16")
	secret := credentialsSecret(ns)

	for _, provider := range []string{ProviderOpenAI, ProviderAzure, ProviderAnthropic, ProviderBedrock} {
		for _, baseURL := range []string{"http://mock-llm.default.svc.cluster.local/v1", "https://10.100.4.2/v1"} {
			t.Run(provider+" "+baseURL, func(t *testing.T) {
				c := setupModelTestClient([]client.Object{
					modelWithConfigMapBaseURL(ns, provider),
					baseURLConfigMapObject(ns, baseURL),
					secret,
				})
				model, err := loadTestModel(context.Background(), c, ns)
				require.NoError(t, err)
				require.NotNil(t, model.Provider)
			})
		}
	}
}

type secretReadCounter struct {
	client.Client
	secretReads int
}

func (s *secretReadCounter) Get(ctx context.Context, key client.ObjectKey, obj client.Object, opts ...client.GetOption) error {
	if _, ok := obj.(*corev1.Secret); ok {
		s.secretReads++
	}
	return s.Client.Get(ctx, key, obj, opts...)
}

func credentialsSecret(ns string) *corev1.Secret {
	return &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{Name: apiKeySecret, Namespace: ns},
		Data:       map[string][]byte{"token": []byte("test-key")},
	}
}

func TestLoadModelChecksBaseURLBeforeReadingCredentials(t *testing.T) {
	ns := defaultNamespace
	t.Setenv(modelurl.WhitelistedDomainsEnv, "")
	t.Setenv(modelurl.AllowedPrivateIPRangeEnv, "")

	for _, provider := range []string{ProviderOpenAI, ProviderAzure, ProviderAnthropic, ProviderBedrock} {
		t.Run(provider, func(t *testing.T) {
			c := &secretReadCounter{Client: setupModelTestClient([]client.Object{
				modelWithConfigMapBaseURL(ns, provider),
				baseURLConfigMapObject(ns, "https://127.0.0.1:1"),
				credentialsSecret(ns),
			})}
			_, err := loadTestModel(context.Background(), c, ns)
			var notAllowed *BaseURLNotAllowedError
			require.ErrorAs(t, err, &notAllowed)
			require.Equal(t, modelurl.RuleLoopback, notAllowed.Rule)
			require.Zero(t, c.secretReads)
		})
	}
}

func TestLoadModelRejectsBaseURLFromSecret(t *testing.T) {
	ns := defaultNamespace
	t.Setenv(modelurl.WhitelistedDomainsEnv, "")
	t.Setenv(modelurl.AllowedPrivateIPRangeEnv, "")
	model := modelWithConfigMapBaseURL(ns, ProviderOpenAI)
	model.Spec.Config.OpenAI.BaseURL = arkv1alpha1.ValueSource{ValueFrom: &arkv1alpha1.ValueFromSource{
		SecretKeyRef: &corev1.SecretKeySelector{
			LocalObjectReference: corev1.LocalObjectReference{Name: "model-endpoint-secret"},
			Key:                  baseURLKey,
		},
	}}
	model.Spec.Config.OpenAI.APIKey = arkv1alpha1.ValueSource{Value: "test-key"}
	c := setupModelTestClient([]client.Object{model, &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{Name: "model-endpoint-secret", Namespace: ns},
		Data:       map[string][]byte{baseURLKey: []byte("https://10.0.0.5/v1")},
	}})

	_, err := loadTestModel(context.Background(), c, ns)
	var notAllowed *BaseURLNotAllowedError
	require.ErrorAs(t, err, &notAllowed)
	require.Equal(t, modelurl.RulePrivateIP, notAllowed.Rule)
	require.NotContains(t, err.Error(), "10.0.0.5")
}

func TestLoadModelRechecksBaseURLAfterConfigMapChange(t *testing.T) {
	ns := defaultNamespace
	t.Setenv(modelurl.WhitelistedDomainsEnv, "")
	t.Setenv(modelurl.AllowedPrivateIPRangeEnv, "")
	c := setupModelTestClient([]client.Object{
		modelWithConfigMapBaseURL(ns, ProviderOpenAI),
		baseURLConfigMapObject(ns, "http://mock-llm.default.svc.cluster.local/v1"),
		credentialsSecret(ns),
	})
	ctx := context.Background()

	_, err := loadTestModel(ctx, c, ns)
	require.NoError(t, err)

	var cm corev1.ConfigMap
	require.NoError(t, c.Get(ctx, types.NamespacedName{Name: baseURLConfigMap, Namespace: ns}, &cm))
	cm.Data[baseURLKey] = "http://127.0.0.1:1"
	require.NoError(t, c.Update(ctx, &cm))

	_, err = loadTestModel(ctx, c, ns)
	var notAllowed *BaseURLNotAllowedError
	require.ErrorAs(t, err, &notAllowed)
	require.Equal(t, modelurl.RuleHTTPS, notAllowed.Rule)
}

func TestLoadModelSkipsCheckWithoutBedrockBaseURL(t *testing.T) {
	ns := defaultNamespace
	model := &arkv1alpha1.Model{
		ObjectMeta: metav1.ObjectMeta{Name: testModelName, Namespace: ns},
		Spec: arkv1alpha1.ModelSpec{
			Model:    arkv1alpha1.ValueSource{Value: "test-model"},
			Provider: ProviderBedrock,
			Config: arkv1alpha1.ModelConfig{Bedrock: &arkv1alpha1.BedrockModelConfig{
				Region: &arkv1alpha1.ValueSource{Value: "us-east-1"},
			}},
		},
	}
	c := setupModelTestClient([]client.Object{model})
	loaded, err := loadTestModel(context.Background(), c, ns)
	require.NoError(t, err)
	require.NotNil(t, loaded.Provider)
}

func TestBaseURLNotAllowedErrorKeepsCause(t *testing.T) {
	err := checkBaseURL("spec.config.openai.baseUrl", "https://10.0.0.5/v1")
	var urlErr *modelurl.Error
	require.True(t, errors.As(err, &urlErr))
	require.Contains(t, urlErr.Error(), "10.0.0.5")
	require.NoError(t, checkBaseURL("spec.config.openai.baseUrl", "https://api.openai.com/v1"))
}
