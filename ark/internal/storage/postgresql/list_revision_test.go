/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"errors"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"mckinsey.com/ark/internal/storage"
)

func TestCheckListRevision(t *testing.T) {
	const head = 100
	tests := []struct {
		name        string
		rev         storage.ListRevision
		wantTooBig  bool
		wantExpired bool
	}{
		{name: "unconstrained", rev: storage.ListRevision{}},
		{name: "unconstrained exact flag ignored", rev: storage.ListRevision{Exact: true}},
		{name: "NotOlderThan below head", rev: storage.ListRevision{RV: 50}},
		{name: "NotOlderThan at head", rev: storage.ListRevision{RV: head}},
		{name: "NotOlderThan head plus one", rev: storage.ListRevision{RV: head + 1}, wantTooBig: true},
		{name: "Exact below head", rev: storage.ListRevision{RV: head - 1, Exact: true}, wantExpired: true},
		{name: "Exact at head", rev: storage.ListRevision{RV: head, Exact: true}},
		{name: "Exact head plus one", rev: storage.ListRevision{RV: head + 1, Exact: true}, wantTooBig: true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := checkListRevision(head, tc.rev)
			switch {
			case tc.wantTooBig:
				assertTooLarge(t, err, tc.rev.RV, head)
			case tc.wantExpired:
				if !errors.Is(err, storage.ErrResourceExpired) {
					t.Fatalf("want ErrResourceExpired, got %v", err)
				}
			case err != nil:
				t.Fatalf("want nil, got %v", err)
			}
		})
	}
}

func assertTooLarge(t *testing.T, err error, requested, current int64) {
	t.Helper()
	var tooLarge *storage.TooLargeResourceVersionError
	if !errors.As(err, &tooLarge) {
		t.Fatalf("want TooLargeResourceVersionError, got %v", err)
	}
	if tooLarge.Requested != requested || tooLarge.Current != current {
		t.Errorf("got %+v, want Requested %d Current %d", tooLarge, requested, current)
	}
}

func TestList_RejectsInvalidResourceVersionBeforeQuerying(t *testing.T) {
	p := &PostgreSQLBackend{}
	tests := []storage.ListOptions{
		{ResourceVersion: "abc", ResourceVersionMatch: metav1.ResourceVersionMatchNotOlderThan},
		{ResourceVersion: "-5"},
		{ResourceVersion: "42", Continue: "tok"},
		{ResourceVersion: "42", ResourceVersionMatch: "Newest"},
	}
	for _, opts := range tests {
		_, _, _, err := p.List(context.Background(), "Agent", "default", opts)
		if !errors.Is(err, storage.ErrInvalidRequest) {
			t.Errorf("List(%+v) error = %v, want ErrInvalidRequest", opts, err)
		}
	}
}
