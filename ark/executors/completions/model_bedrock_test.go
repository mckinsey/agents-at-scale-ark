package completions

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/common"
)

func setupBedrockTestClient(objects []client.Object) client.Client {
	scheme := runtime.NewScheme()
	_ = corev1.AddToScheme(scheme)
	_ = arkv1alpha1.AddToScheme(scheme)
	return fake.NewClientBuilder().WithScheme(scheme).WithObjects(objects...).Build()
}

func loadBedrockModel(t *testing.T, fakeClient client.Client, config *arkv1alpha1.BedrockModelConfig) (*BedrockModel, error) {
	t.Helper()
	resolver := common.NewValueSourceResolver(fakeClient)
	model := &Model{}
	err := loadBedrockConfig(context.Background(), resolver, config, "default", "anthropic.claude-v2", model)
	if err != nil {
		return nil, err
	}
	bedrockModel, ok := model.Provider.(*BedrockModel)
	require.True(t, ok)
	return bedrockModel, nil
}

func TestLoadBedrockConfig_APIKeyDirectValue(t *testing.T) {
	fakeClient := setupBedrockTestClient(nil)
	config := &arkv1alpha1.BedrockModelConfig{
		Region: &arkv1alpha1.ValueSource{Value: "us-east-1"},
		APIKey: &arkv1alpha1.ValueSource{Value: "test-bedrock-key"},
	}

	bedrockModel, err := loadBedrockModel(t, fakeClient, config)
	require.NoError(t, err)
	require.Equal(t, "test-bedrock-key", bedrockModel.APIKey)
}

func TestLoadBedrockConfig_APIKeyFromSecret(t *testing.T) {
	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{Name: "bedrock-secret", Namespace: "default"},
		Data:       map[string][]byte{"api-key": []byte("secret-bedrock-key")},
	}
	fakeClient := setupBedrockTestClient([]client.Object{secret})
	config := &arkv1alpha1.BedrockModelConfig{
		Region: &arkv1alpha1.ValueSource{Value: "us-east-1"},
		APIKey: &arkv1alpha1.ValueSource{
			ValueFrom: &arkv1alpha1.ValueFromSource{
				SecretKeyRef: &corev1.SecretKeySelector{
					LocalObjectReference: corev1.LocalObjectReference{Name: "bedrock-secret"},
					Key:                  "api-key",
				},
			},
		},
	}

	bedrockModel, err := loadBedrockModel(t, fakeClient, config)
	require.NoError(t, err)
	require.Equal(t, "secret-bedrock-key", bedrockModel.APIKey)
}

func TestLoadBedrockConfig_NoAPIKeyFallsBack(t *testing.T) {
	fakeClient := setupBedrockTestClient(nil)
	config := &arkv1alpha1.BedrockModelConfig{
		Region:          &arkv1alpha1.ValueSource{Value: "us-east-1"},
		AccessKeyID:     &arkv1alpha1.ValueSource{Value: "test-access-key"},
		SecretAccessKey: &arkv1alpha1.ValueSource{Value: "test-secret-key"},
	}

	bedrockModel, err := loadBedrockModel(t, fakeClient, config)
	require.NoError(t, err)
	require.Empty(t, bedrockModel.APIKey)
	require.Equal(t, "test-access-key", bedrockModel.AccessKeyID)
}

func TestLoadBedrockConfig_ConfiguredAPIKeyResolvesEmptyErrors(t *testing.T) {
	fakeClient := setupBedrockTestClient(nil)
	config := &arkv1alpha1.BedrockModelConfig{
		Region: &arkv1alpha1.ValueSource{Value: "us-east-1"},
		APIKey: &arkv1alpha1.ValueSource{Value: ""},
	}

	_, err := loadBedrockModel(t, fakeClient, config)
	require.Error(t, err)
	require.Contains(t, err.Error(), "apiKey")
}

func TestLoadBedrockConfig_ConfiguredAPIKeyMissingSecretErrors(t *testing.T) {
	fakeClient := setupBedrockTestClient(nil)
	config := &arkv1alpha1.BedrockModelConfig{
		Region: &arkv1alpha1.ValueSource{Value: "us-east-1"},
		APIKey: &arkv1alpha1.ValueSource{
			ValueFrom: &arkv1alpha1.ValueFromSource{
				SecretKeyRef: &corev1.SecretKeySelector{
					LocalObjectReference: corev1.LocalObjectReference{Name: "missing-secret"},
					Key:                  "api-key",
				},
			},
		},
	}

	_, err := loadBedrockModel(t, fakeClient, config)
	require.Error(t, err)
	require.Contains(t, err.Error(), "apiKey")
}

func TestBedrockModel_BuildConfigOmitsAPIKey(t *testing.T) {
	bm := NewBedrockModel("anthropic.claude-v2", "us-east-1", "", "", "", "", "test-bedrock-key", "", nil)
	cfg := bm.BuildConfig()
	require.NotContains(t, cfg, "apiKey")
	for _, v := range cfg {
		require.NotEqual(t, "test-bedrock-key", v)
	}
}
