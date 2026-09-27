package validation

import (
	"context"

	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/webhook/admission"
)

type WebhookValidator[T runtime.Object] struct {
	V *Validator
}

func (wv *WebhookValidator[T]) ValidateCreate(ctx context.Context, obj T) (admission.Warnings, error) {
	warnings, err := wv.V.Validate(ctx, obj)
	return admission.Warnings(warnings), err
}

func (wv *WebhookValidator[T]) ValidateUpdate(ctx context.Context, _, newObj T) (admission.Warnings, error) {
	warnings, err := wv.V.Validate(ctx, newObj)
	return admission.Warnings(warnings), err
}

func (wv *WebhookValidator[T]) ValidateDelete(_ context.Context, _ T) (admission.Warnings, error) {
	return nil, nil
}

type WebhookDefaulter[T runtime.Object] struct {
	Lookup DefaultsLookup
}

func (d *WebhookDefaulter[T]) Default(ctx context.Context, obj T) error {
	ApplyDefaults(ctx, obj, d.Lookup)
	return nil
}
