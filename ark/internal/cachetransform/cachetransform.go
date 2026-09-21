/* Copyright 2025. McKinsey & Company */

package cachetransform

import (
	"k8s.io/apimachinery/pkg/api/meta"
	toolscache "k8s.io/client-go/tools/cache"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func StripManagedFields() toolscache.TransformFunc {
	return func(in any) (any, error) {
		if obj, err := meta.Accessor(in); err == nil && obj.GetManagedFields() != nil {
			obj.SetManagedFields(nil)
		}
		return in, nil
	}
}

func StripQuery() toolscache.TransformFunc {
	return func(in any) (any, error) {
		query, ok := in.(*arkv1alpha1.Query)
		if !ok {
			return StripManagedFields()(in)
		}
		query.SetManagedFields(nil)
		if query.Status.Response != nil {
			query.Status.Response.Content = ""
		}
		return query, nil
	}
}
