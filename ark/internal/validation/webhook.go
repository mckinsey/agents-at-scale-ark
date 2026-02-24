package validation

import (
	"context"

	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/webhook"
	"sigs.k8s.io/controller-runtime/pkg/webhook/admission"
)

type WebhookValidator struct {
	V *Validator
}

var _ webhook.CustomValidator = &WebhookValidator{}

func (wv *WebhookValidator) ValidateCreate(ctx context.Context, obj runtime.Object) (admission.Warnings, error) {
	warnings, err := wv.V.Validate(ctx, obj)
	return admission.Warnings(warnings), err
}

func (wv *WebhookValidator) ValidateUpdate(ctx context.Context, _, newObj runtime.Object) (admission.Warnings, error) {
	warnings, err := wv.V.Validate(ctx, newObj)
	return admission.Warnings(warnings), err
}

func (wv *WebhookValidator) ValidateDelete(_ context.Context, _ runtime.Object) (admission.Warnings, error) {
	return nil, nil
}

type WebhookDefaulter struct{}

var _ webhook.CustomDefaulter = &WebhookDefaulter{}

func (d *WebhookDefaulter) Default(_ context.Context, obj runtime.Object) error {
	ApplyDefaults(obj)
	return nil
}
