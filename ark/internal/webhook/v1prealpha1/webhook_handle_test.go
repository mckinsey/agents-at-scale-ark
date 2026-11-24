package v1prealpha1

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	admissionv1 "k8s.io/api/admission/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
	"sigs.k8s.io/controller-runtime/pkg/webhook/admission"

	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	"mckinsey.com/ark/internal/validation"
)

// The generic webhook builder instantiates the request object by reflecting on
// its type parameter; a runtime.Object (interface) argument makes that
// reflection panic, so the handler must be wired with the concrete type. Drive
// Handle end-to-end so a reintroduction fails here instead of only in e2e.
func TestExecutionEngineWebhookHandleDoesNotPanic(t *testing.T) {
	s := runtime.NewScheme()
	if err := arkv1prealpha1.AddToScheme(s); err != nil {
		t.Fatalf("add to scheme: %v", err)
	}
	c := fake.NewClientBuilder().WithScheme(s).Build()
	v := validation.NewValidator(&validation.WebhookLookup{Client: c})
	wh := admission.WithValidator(s, &validation.WebhookValidator[*arkv1prealpha1.ExecutionEngine]{V: v})

	raw, err := json.Marshal(&arkv1prealpha1.ExecutionEngine{
		ObjectMeta: metav1.ObjectMeta{Name: "ee", Namespace: "default"},
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	resp := wh.Handle(context.Background(), admission.Request{
		AdmissionRequest: admissionv1.AdmissionRequest{
			Operation: admissionv1.Create,
			Object:    runtime.RawExtension{Raw: raw},
		},
	})

	if resp.Result != nil && strings.Contains(resp.Result.Message, "panic") {
		t.Fatalf("webhook handler panicked: %s", resp.Result.Message)
	}
}
