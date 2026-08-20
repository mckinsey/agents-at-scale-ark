/* Copyright 2025. McKinsey & Company */

package controller

import (
	"bytes"
	"context"
	"maps"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/event"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
	"sigs.k8s.io/controller-runtime/pkg/predicate"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"
)

// getPollInterval safely extracts the poll interval duration from a pointer.
// Returns a default of 1 minute if the pointer is nil.
// This is necessary when using aggregated API server (non-CRD storage) because
// optional fields with omitempty may not be initialized.
func getPollInterval(interval *metav1.Duration) time.Duration {
	if interval == nil {
		return time.Minute
	}
	return interval.Duration
}

// dataChangedPredicate drops ConfigMap and Secret updates that leave the
// payload untouched. Reconciling a dependent resource is expensive - an
// MCPServer reconnects and re-runs ListTools - so an edit that only touches a
// description, alias or label must not enqueue every resource referencing the
// object. Creates, deletes and generic events always pass, as does any other
// object type, so the predicate never hides an event it does not understand.
func dataChangedPredicate() predicate.Predicate {
	return predicate.Funcs{
		UpdateFunc: func(e event.UpdateEvent) bool {
			switch old := e.ObjectOld.(type) {
			case *corev1.ConfigMap:
				updated, ok := e.ObjectNew.(*corev1.ConfigMap)
				if !ok {
					return true
				}
				return !maps.Equal(old.Data, updated.Data) ||
					!maps.EqualFunc(old.BinaryData, updated.BinaryData, bytes.Equal)
			case *corev1.Secret:
				updated, ok := e.ObjectNew.(*corev1.Secret)
				if !ok {
					return true
				}
				return !maps.EqualFunc(old.Data, updated.Data, bytes.Equal)
			default:
				return true
			}
		},
	}
}

// mapDependencyRequests lists resources in the changed object's namespace and
// returns reconcile requests for those matching. On a list error it returns nil
// rather than failing: the requeue poll is the recovery backstop, so a missed
// watch event is not fatal. Callers supply type-specific accessors so a single
// implementation serves every controller that watches Secret/ConfigMap refs.
func mapDependencyRequests[T any, L client.ObjectList](
	ctx context.Context,
	c client.Client,
	obj client.Object,
	list L,
	items func(L) []T,
	matches func(T) bool,
	key func(T) types.NamespacedName,
) []reconcile.Request {
	if err := c.List(ctx, list, client.InNamespace(obj.GetNamespace())); err != nil {
		logf.FromContext(ctx).Error(err, "failed to list resources for dependency mapping", "namespace", obj.GetNamespace())
		return nil
	}
	var requests []reconcile.Request
	for _, item := range items(list) {
		if matches(item) {
			requests = append(requests, reconcile.Request{NamespacedName: key(item)})
		}
	}
	return requests
}
