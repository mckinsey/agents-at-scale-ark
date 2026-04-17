package v1

import (
	"context"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/webhook"

	"mckinsey.com/ark/internal/validation"
)

// +kubebuilder:webhook:path=/mutate-ark-mckinsey-com-v1alpha1-evaluation,mutating=true,failurePolicy=ignore,sideEffects=None,groups=ark.mckinsey.com,resources=evaluations,verbs=create,versions=v1alpha1,name=mevaluation-v1.kb.io,admissionReviewVersions=v1

type EvaluationDefaulter struct {
	Lookup validation.ArkConfigLookup
}

var _ webhook.CustomDefaulter = &EvaluationDefaulter{}

var evaluationGVK = schema.GroupVersionKind{
	Group:   "ark.mckinsey.com",
	Version: "v1alpha1",
	Kind:    "Evaluation",
}

func (d *EvaluationDefaulter) Default(ctx context.Context, obj runtime.Object) error {
	u, ok := obj.(*unstructured.Unstructured)
	if !ok {
		return nil
	}
	if _, found, _ := unstructured.NestedString(u.Object, "spec", "ttl"); found {
		return nil
	}
	ttl := validation.ResolveEvalTTL(ctx, d.Lookup)
	return unstructured.SetNestedField(u.Object, ttl.Duration.String(), "spec", "ttl")
}

func SetupEvaluationWebhookWithManager(mgr ctrl.Manager) error {
	lookup := &validation.WebhookLookup{Client: mgr.GetClient()}
	u := &unstructured.Unstructured{}
	u.SetGroupVersionKind(evaluationGVK)
	return ctrl.NewWebhookManagedBy(mgr).
		For(u).
		WithDefaulter(&EvaluationDefaulter{Lookup: lookup}).
		Complete()
}
