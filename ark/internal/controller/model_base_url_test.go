/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/eventing"
	eventnoop "mckinsey.com/ark/internal/eventing/noop"
	"mckinsey.com/ark/internal/modelurl"
	telenoop "mckinsey.com/ark/internal/telemetry/noop"
)

func modelWithBaseURLConfigMap(name string) *arkv1alpha1.Model {
	return &arkv1alpha1.Model{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "default"},
		Spec: arkv1alpha1.ModelSpec{
			Provider: "openai",
			Model:    arkv1alpha1.ValueSource{Value: "gpt-4o"},
			Config: arkv1alpha1.ModelConfig{
				OpenAI: &arkv1alpha1.OpenAIModelConfig{
					BaseURL: arkv1alpha1.ValueSource{ValueFrom: &arkv1alpha1.ValueFromSource{
						ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
							LocalObjectReference: corev1.LocalObjectReference{Name: "model-endpoint"},
							Key:                  "base-url",
						},
					}},
					APIKey: arkv1alpha1.ValueSource{ValueFrom: &arkv1alpha1.ValueFromSource{
						SecretKeyRef: &corev1.SecretKeySelector{
							LocalObjectReference: corev1.LocalObjectReference{Name: "model-credentials"},
							Key:                  "token",
						},
					}},
				},
			},
		},
	}
}

type unavailableRecorder struct {
	eventing.ModelRecorder
	messages []string
}

func (u *unavailableRecorder) ModelUnavailable(_ context.Context, _ runtime.Object, reason string) {
	u.messages = append(u.messages, reason)
}

type recordingEventing struct {
	eventing.Provider
	model *unavailableRecorder
}

func (r *recordingEventing) ModelRecorder() eventing.ModelRecorder {
	return r.model
}

func reconcileModelCondition(t *testing.T, objects ...client.Object) (*metav1.Condition, []string) {
	t.Helper()
	scheme := newTestScheme()
	require.NoError(t, corev1.AddToScheme(scheme))
	c := fake.NewClientBuilder().WithScheme(scheme).WithObjects(objects...).WithStatusSubresource(&arkv1alpha1.Model{}).Build()
	events := &recordingEventing{Provider: eventnoop.NewProvider(), model: &unavailableRecorder{ModelRecorder: eventnoop.NewModelRecorder()}}
	r := &ModelReconciler{Client: c, Scheme: scheme, Telemetry: telenoop.NewProvider(), Eventing: events}

	ctx := context.Background()
	key := types.NamespacedName{Name: "m", Namespace: "default"}
	_, err := r.Reconcile(ctx, reconcile.Request{NamespacedName: key})
	require.NoError(t, err)

	var model arkv1alpha1.Model
	require.NoError(t, c.Get(ctx, key, &model))
	condition := meta.FindStatusCondition(model.Status.Conditions, ModelAvailable)
	require.NotNil(t, condition)
	return condition, events.model.messages
}

func TestModelProbeRejectsResolvedBaseURL(t *testing.T) {
	tests := []struct {
		name      string
		baseURL   string
		whitelist string
		message   string
	}{
		{
			name:    "plain HTTP to loopback",
			baseURL: "http://127.0.0.1:1",
			message: "spec.config.openai.baseUrl is not allowed by the model URL policy: hosts outside the cluster must use HTTPS",
		},
		{
			name:    "plain HTTP to an external host",
			baseURL: "http://models.example.org/v1",
			message: "spec.config.openai.baseUrl is not allowed by the model URL policy: hosts outside the cluster must use HTTPS",
		},
		{
			name:    "private address",
			baseURL: "https://10.0.0.5/v1",
			message: "spec.config.openai.baseUrl is not allowed by the model URL policy: private addresses outside ALLOWED_PRIVATE_IP_RANGES are not allowed",
		},
		{
			name:      "host outside the allowlist",
			baseURL:   "https://models.example.org/v1",
			whitelist: "api.openai.com",
			message:   "spec.config.openai.baseUrl is not allowed by the model URL policy: the host is not in WHITELISTED_MODEL_DOMAINS",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv(modelurl.WhitelistedDomainsEnv, tt.whitelist)
			t.Setenv(modelurl.AllowedPrivateIPRangeEnv, "")

			condition, events := reconcileModelCondition(
				t,
				modelWithBaseURLConfigMap("m"),
				&corev1.ConfigMap{
					ObjectMeta: metav1.ObjectMeta{Name: "model-endpoint", Namespace: "default"},
					Data:       map[string]string{"base-url": tt.baseURL},
				},
			)

			require.Equal(t, metav1.ConditionFalse, condition.Status)
			require.Equal(t, BaseURLNotAllowedReason, condition.Reason)
			require.Equal(t, tt.message, condition.Message)
			require.NotContains(t, condition.Message, tt.baseURL)
			require.Equal(t, []string{tt.message}, events)
		})
	}
}

func TestModelProbeKeepsProbeFailedReasonForOtherLoadErrors(t *testing.T) {
	t.Setenv(modelurl.WhitelistedDomainsEnv, "")
	t.Setenv(modelurl.AllowedPrivateIPRangeEnv, "")

	condition, _ := reconcileModelCondition(t, modelWithBaseURLConfigMap("m"))

	require.Equal(t, metav1.ConditionFalse, condition.Status)
	require.Equal(t, ModelProbeFailedReason, condition.Reason)
}

func TestProbeModelReturnsCauseForBaseURLRejection(t *testing.T) {
	t.Setenv(modelurl.WhitelistedDomainsEnv, "")
	t.Setenv(modelurl.AllowedPrivateIPRangeEnv, "")
	scheme := newTestScheme()
	require.NoError(t, corev1.AddToScheme(scheme))
	model := modelWithBaseURLConfigMap("m")
	c := fake.NewClientBuilder().WithScheme(scheme).WithObjects(model, &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{Name: "model-endpoint", Namespace: "default"},
		Data:       map[string]string{"base-url": "https://10.0.0.5/v1"},
	}).Build()
	r := &ModelReconciler{Client: c, Scheme: scheme}

	result := r.probeModel(context.Background(), *model)

	require.False(t, result.Available)
	require.Equal(t, BaseURLNotAllowedReason, result.Reason)
	rule, ok := modelurl.RuleOf(result.DetailedError)
	require.True(t, ok)
	require.Equal(t, modelurl.RulePrivateIP, rule)
	require.Contains(t, result.DetailedError.Error(), "10.0.0.5")
}
