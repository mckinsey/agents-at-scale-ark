/* Copyright 2025. McKinsey & Company */

package cachetransform

import (
	"k8s.io/apimachinery/pkg/api/meta"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func StripManagedFields(in any) (any, error) {
	if obj, err := meta.Accessor(in); err == nil && obj.GetManagedFields() != nil {
		obj.SetManagedFields(nil)
	}
	return in, nil
}

func StripQuery(in any) (any, error) {
	query, ok := in.(*arkv1alpha1.Query)
	if !ok {
		return in, nil
	}
	query.SetManagedFields(nil)
	if arkv1alpha1.IsTerminalPhase(query.Status.Phase) && query.Status.Response != nil {
		query.Status.Response.Content = ""
		query.Status.Response.Raw = ""
	}
	return query, nil
}
