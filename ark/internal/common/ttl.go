/* Copyright 2025. McKinsey & Company */

package common

import (
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func TtlSecondsFromQuery(query *arkv1alpha1.Query) *int64 {
	if query.Spec.TTL == nil {
		return nil
	}
	secs := int64(query.Spec.TTL.Seconds())
	return &secs
}
