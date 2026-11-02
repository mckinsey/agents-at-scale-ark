package validation

import (
	"context"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/crossns"
)

type crossNamespaceRefSkipKey struct{}

func CrossNamespaceRefContextForUpdate(ctx context.Context, oldObj, newObj runtime.Object) context.Context {
	switch newRes := newObj.(type) {
	case *arkv1alpha1.Agent:
		oldRes, ok := oldObj.(*arkv1alpha1.Agent)
		if ok && agentModelRefTarget(oldRes) == agentModelRefTarget(newRes) {
			return context.WithValue(ctx, crossNamespaceRefSkipKey{}, true)
		}
	case *arkv1alpha1.Query:
		oldRes, ok := oldObj.(*arkv1alpha1.Query)
		if ok && queryMemoryTarget(oldRes) == queryMemoryTarget(newRes) {
			return context.WithValue(ctx, crossNamespaceRefSkipKey{}, true)
		}
	}
	return ctx
}

func crossNamespaceRefSkipped(ctx context.Context) bool {
	skip, _ := ctx.Value(crossNamespaceRefSkipKey{}).(bool)
	return skip
}

type refTarget struct {
	namespace string
	name      string
}

func agentModelRefTarget(agent *arkv1alpha1.Agent) refTarget {
	if agent.Spec.ModelRef == nil {
		return refTarget{}
	}
	return refTarget{namespace: agent.Spec.ModelRef.Namespace, name: agent.Spec.ModelRef.Name}
}

func queryMemoryTarget(query *arkv1alpha1.Query) refTarget {
	if query.Spec.Memory == nil {
		return refTarget{}
	}
	return refTarget{namespace: query.Spec.Memory.Namespace, name: query.Spec.Memory.Name}
}

func (v *Validator) validateCrossNamespaceRef(ctx context.Context, kind string, target refTarget, fromNamespace string) error {
	if crossNamespaceRefSkipped(ctx) || target.namespace == "" || target.namespace == fromNamespace {
		return nil
	}
	obj, err := v.Lookup.GetResource(ctx, kind, target.namespace, target.name)
	if err == nil {
		if meta, ok := obj.(metav1.Object); ok && crossns.Allowed(meta, fromNamespace) {
			return nil
		}
	}
	return crossns.DeniedError(kind, target.namespace, target.name, fromNamespace)
}
