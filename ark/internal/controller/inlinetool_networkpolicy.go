/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"fmt"
	"maps"
	"slices"
	"strings"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	"k8s.io/apimachinery/pkg/api/equality"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/event"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
	"sigs.k8s.io/controller-runtime/pkg/predicate"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/inlinetools"
)

// checkInlinePolicies returns a conflict message separately from an API error.
// Live pods can retain old or administratively edited labels after the template
// is repaired, so template-only checks would miss policies selecting those pods.
func (r *ToolReconciler) checkInlinePolicies(ctx context.Context, tool *arkv1alpha1.Tool) (string, error) {
	var policies networkingv1.NetworkPolicyList
	if err := r.List(ctx, &policies, client.InNamespace(tool.Namespace)); err != nil {
		return "", fmt.Errorf("cannot list runner NetworkPolicies: %w", err)
	}
	slices.SortFunc(policies.Items, func(a, b networkingv1.NetworkPolicy) int { return strings.Compare(a.Name, b.Name) })
	deployment := &appsv1.Deployment{}
	if err := r.Get(ctx, client.ObjectKey{Namespace: tool.Namespace, Name: inlineChildNames(tool.Name).Runner}, deployment); err != nil {
		return "", fmt.Errorf("cannot read runner Deployment: %w", err)
	}
	var replicaSets appsv1.ReplicaSetList
	if err := r.List(ctx, &replicaSets, client.InNamespace(tool.Namespace)); err != nil {
		return "", fmt.Errorf("cannot list runner ReplicaSets: %w", err)
	}
	ownedSets := map[types.UID]bool{}
	for _, rs := range replicaSets.Items {
		if owner := metav1.GetControllerOf(&rs); owner != nil && owner.Kind == "Deployment" && owner.UID == deployment.UID {
			ownedSets[rs.UID] = true
		}
	}
	var pods corev1.PodList
	if err := r.List(ctx, &pods, client.InNamespace(tool.Namespace)); err != nil {
		return "", fmt.Errorf("cannot list runner Pods: %w", err)
	}
	labelSets := []map[string]string{deployment.Spec.Template.Labels}
	for _, pod := range pods.Items {
		owner := metav1.GetControllerOf(&pod)
		if owner == nil || owner.Kind != "ReplicaSet" || !ownedSets[owner.UID] {
			continue
		}
		if !labels.SelectorFromSet(inlineLabels(tool)).Matches(labels.Set(pod.Labels)) {
			return "", fmt.Errorf("runner Pod %s/%s no longer matches its owned NetworkPolicy: an administrator must restore the runner labels", pod.Namespace, pod.Name)
		}
		labelSets = append(labelSets, pod.Labels)
	}
	for _, policy := range policies.Items {
		for _, podLabels := range labelSets {
			if err := inlinetools.CheckRunnerNetworkPolicy(&policy, tool.Namespace, podLabels, activatorNamespace(), activatorSelector()); err != nil {
				return err.Error(), nil
			}
		}
	}
	return "", nil
}

// ponytail: namespace-wide scans keep selector and removed-label changes correct;
// add owner indexes if measured namespace size makes this expensive.
func (r *ToolReconciler) inlineToolsInNamespace(ctx context.Context, obj client.Object) []reconcile.Request {
	var tools arkv1alpha1.ToolList
	if err := r.List(ctx, &tools, client.InNamespace(obj.GetNamespace())); err != nil {
		logf.FromContext(ctx).Error(err, "cannot enqueue inline tools after network change", "namespace", obj.GetNamespace())
		return nil // The periodic status check retries missed events.
	}
	var requests []reconcile.Request
	for _, tool := range tools.Items {
		if tool.Spec.Type == arkv1alpha1.ToolTypeInline {
			requests = append(requests, reconcile.Request{NamespacedName: client.ObjectKeyFromObject(&tool)})
		}
	}
	return requests
}

func inlineNetworkLabelsChanged() predicate.Predicate {
	return predicate.Funcs{UpdateFunc: func(e event.UpdateEvent) bool {
		return !maps.Equal(e.ObjectOld.GetLabels(), e.ObjectNew.GetLabels()) ||
			!equality.Semantic.DeepEqual(e.ObjectOld.GetOwnerReferences(), e.ObjectNew.GetOwnerReferences())
	}}
}
