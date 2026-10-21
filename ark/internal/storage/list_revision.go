/* Copyright 2025. McKinsey & Company */

package storage

import (
	"fmt"
	"strconv"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type ListRevision struct {
	RV    uint64
	Exact bool
}

type TooLargeResourceVersionError struct {
	Requested uint64
	Current   int64
}

func (e *TooLargeResourceVersionError) Error() string {
	return fmt.Sprintf("too large resource version: %d, current: %d", e.Requested, e.Current)
}

func ParseMinResourceVersion(rv string) (uint64, error) {
	if rv == "" || rv == "0" {
		return 0, nil
	}
	parsed, err := strconv.ParseUint(rv, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("%w: invalid resourceVersion %q", ErrInvalidRequest, rv)
	}
	return parsed, nil
}

func (o ListOptions) Revision() (ListRevision, error) {
	if o.Continue != "" && o.ResourceVersion != "" && o.ResourceVersion != "0" {
		return ListRevision{}, fmt.Errorf("%w: specifying resource version is not allowed when using continue", ErrInvalidRequest)
	}
	rv, err := ParseMinResourceVersion(o.ResourceVersion)
	if err != nil || rv == 0 {
		return ListRevision{}, err
	}
	switch o.ResourceVersionMatch {
	case metav1.ResourceVersionMatchNotOlderThan, "":
		return ListRevision{RV: rv}, nil
	case metav1.ResourceVersionMatchExact:
		return ListRevision{RV: rv, Exact: true}, nil
	default:
		return ListRevision{}, fmt.Errorf("%w: unsupported resourceVersionMatch %q", ErrInvalidRequest, o.ResourceVersionMatch)
	}
}
