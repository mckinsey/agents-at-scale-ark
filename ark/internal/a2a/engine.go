/* Copyright 2025. McKinsey & Company */

package a2a

import (
	"context"
	"fmt"

	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
)

// IsNamedEngine reports whether ref designates an external ExecutionEngine
// resource: non-nil, with a name, and not the reserved "a2a" engine. Agents on
// the reserved engine delegate to an A2AServer via annotations rather than to an
// ExecutionEngine resource, so they are not named engines.
func IsNamedEngine(ref *arkv1alpha1.ExecutionEngineRef) bool {
	return ref != nil && ref.Name != "" && ref.Name != ExecutionEngineA2A
}

// ResolveExecutionEngineAddress returns the dispatch address of a named
// ExecutionEngine. ref.Namespace defaults to defaultNamespace when empty.
// Callers must handle the reserved "a2a" engine themselves; this does not
// special-case it. The resource is returned so callers can read its annotations
// without a second Get.
func ResolveExecutionEngineAddress(ctx context.Context, k8sClient client.Client, ref *arkv1alpha1.ExecutionEngineRef, defaultNamespace string) (string, *arkv1prealpha1.ExecutionEngine, error) {
	namespace := ref.Namespace
	if namespace == "" {
		namespace = defaultNamespace
	}

	var engineCRD arkv1prealpha1.ExecutionEngine
	if err := k8sClient.Get(ctx, types.NamespacedName{Name: ref.Name, Namespace: namespace}, &engineCRD); err != nil {
		return "", nil, fmt.Errorf("execution engine %s not found in namespace %s: %w", ref.Name, namespace, err)
	}

	if engineCRD.Status.LastResolvedAddress == "" {
		return "", nil, fmt.Errorf("execution engine %s address not yet resolved", ref.Name)
	}

	return engineCRD.Status.LastResolvedAddress, &engineCRD, nil
}
