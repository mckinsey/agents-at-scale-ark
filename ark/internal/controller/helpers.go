/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
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
