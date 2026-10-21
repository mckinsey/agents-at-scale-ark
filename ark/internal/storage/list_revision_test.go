/* Copyright 2025. McKinsey & Company */

package storage

import (
	"errors"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func TestListOptionsRevision(t *testing.T) {
	notOlder := metav1.ResourceVersionMatchNotOlderThan
	exact := metav1.ResourceVersionMatchExact
	tests := []struct {
		name    string
		opts    ListOptions
		want    ListRevision
		wantErr bool
	}{
		{name: "no resourceVersion", opts: ListOptions{}, want: ListRevision{}},
		{name: "resourceVersion 0", opts: ListOptions{ResourceVersion: "0"}, want: ListRevision{}},
		{name: "resourceVersion 0 with NotOlderThan", opts: ListOptions{ResourceVersion: "0", ResourceVersionMatch: notOlder}, want: ListRevision{}},
		{name: "resourceVersion 0 with limit", opts: ListOptions{ResourceVersion: "0", Limit: 1}, want: ListRevision{}},
		{name: "NotOlderThan", opts: ListOptions{ResourceVersion: "42", ResourceVersionMatch: notOlder}, want: ListRevision{RV: 42}},
		{name: "NotOlderThan with limit", opts: ListOptions{ResourceVersion: "42", ResourceVersionMatch: notOlder, Limit: 1}, want: ListRevision{RV: 42}},
		{name: "Exact", opts: ListOptions{ResourceVersion: "42", ResourceVersionMatch: exact}, want: ListRevision{RV: 42, Exact: true}},
		{name: "Exact with limit", opts: ListOptions{ResourceVersion: "42", ResourceVersionMatch: exact, Limit: 1}, want: ListRevision{RV: 42, Exact: true}},
		{name: "legacy without limit is NotOlderThan", opts: ListOptions{ResourceVersion: "42"}, want: ListRevision{RV: 42}},
		{name: "legacy with limit is Exact", opts: ListOptions{ResourceVersion: "42", Limit: 1}, want: ListRevision{RV: 42, Exact: true}},
		{name: "continue without resourceVersion", opts: ListOptions{Continue: "tok"}, want: ListRevision{}},
		{name: "continue with resourceVersion 0", opts: ListOptions{Continue: "tok", ResourceVersion: "0"}, want: ListRevision{}},
		{name: "continue with resourceVersion", opts: ListOptions{Continue: "tok", ResourceVersion: "42"}, wantErr: true},
		{name: "continue with resourceVersion and match", opts: ListOptions{Continue: "tok", ResourceVersion: "42", ResourceVersionMatch: notOlder}, wantErr: true},
		{name: "not a number", opts: ListOptions{ResourceVersion: "abc", ResourceVersionMatch: notOlder}, wantErr: true},
		{name: "negative", opts: ListOptions{ResourceVersion: "-5"}, wantErr: true},
		{name: "explicit plus sign", opts: ListOptions{ResourceVersion: "+5"}, wantErr: true},
		{name: "unknown match", opts: ListOptions{ResourceVersion: "42", ResourceVersionMatch: "Newest"}, wantErr: true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := tc.opts.Revision()
			if tc.wantErr {
				if !errors.Is(err, ErrInvalidRequest) {
					t.Fatalf("Revision() error = %v, want ErrInvalidRequest", err)
				}
				return
			}
			if err != nil {
				t.Fatalf("Revision() error = %v", err)
			}
			if got != tc.want {
				t.Errorf("Revision() = %+v, want %+v", got, tc.want)
			}
		})
	}
}

func TestTooLargeResourceVersionError(t *testing.T) {
	var err error = &TooLargeResourceVersionError{Requested: 10, Current: 5}
	var tooLarge *TooLargeResourceVersionError
	if !errors.As(err, &tooLarge) {
		t.Fatal("errors.As did not match TooLargeResourceVersionError")
	}
	if tooLarge.Requested != 10 || tooLarge.Current != 5 {
		t.Errorf("got %+v, want Requested 10 Current 5", tooLarge)
	}
	if got, want := err.Error(), "too large resource version: 10, current: 5"; got != want {
		t.Errorf("Error() = %q, want %q", got, want)
	}
}
