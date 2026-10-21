/* Copyright 2025. McKinsey & Company */

package storage

import (
	"fmt"
	"strconv"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type ListRevision struct {
	RV    int64
	Exact bool
}

type TooLargeResourceVersionError struct {
	Requested int64
	Current   int64
}

func (e *TooLargeResourceVersionError) Error() string {
	return fmt.Sprintf("too large resource version: %d, current: %d", e.Requested, e.Current)
}

func (o ListOptions) Revision() (ListRevision, error) {
	unset := o.ResourceVersion == "" || o.ResourceVersion == "0"
	if o.Continue != "" && !unset {
		return ListRevision{}, fmt.Errorf("%w: specifying resource version is not allowed when using continue", ErrInvalidRequest)
	}
	if unset {
		return ListRevision{}, nil
	}
	rv, err := strconv.ParseUint(o.ResourceVersion, 10, 63)
	if err != nil {
		return ListRevision{}, fmt.Errorf("%w: invalid resourceVersion %q", ErrInvalidRequest, o.ResourceVersion)
	}
	switch o.ResourceVersionMatch {
	case metav1.ResourceVersionMatchNotOlderThan:
		return ListRevision{RV: int64(rv)}, nil
	case metav1.ResourceVersionMatchExact:
		return ListRevision{RV: int64(rv), Exact: true}, nil
	case "":
		return ListRevision{RV: int64(rv), Exact: o.Limit > 0}, nil
	default:
		return ListRevision{}, fmt.Errorf("%w: unsupported resourceVersionMatch %q", ErrInvalidRequest, o.ResourceVersionMatch)
	}
}
