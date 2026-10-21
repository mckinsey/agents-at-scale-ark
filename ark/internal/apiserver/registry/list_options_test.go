/* Copyright 2025. McKinsey & Company */

package registry

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"testing"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metainternalversion "k8s.io/apimachinery/pkg/apis/meta/internalversion"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/watch"
	k8sstorage "k8s.io/apiserver/pkg/storage"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/storage"
)

type recordingListBackend struct {
	*mockBackend
	opts storage.ListOptions
}

func (b *recordingListBackend) List(ctx context.Context, kind, namespace string, opts storage.ListOptions) ([]runtime.Object, string, int64, error) {
	b.opts = opts
	return b.mockBackend.List(ctx, kind, namespace, opts)
}

func newListOptionsTestStorage(backend storage.Backend) *GenericStorage {
	return NewGenericStorage(backend, &mockConverter{}, ResourceConfig{
		Kind:         "Agent",
		Resource:     "agents",
		SingularName: "agent",
		NewFunc:      func() runtime.Object { return &arkv1alpha1.Agent{} },
		NewListFunc:  func() runtime.Object { return &arkv1alpha1.AgentList{} },
	}, nil)
}

func TestGenericStorage_List_PassesResourceVersionToTheBackend(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name string
		in   *metainternalversion.ListOptions
	}{
		{"NotOlderThan", &metainternalversion.ListOptions{ResourceVersion: "62703", ResourceVersionMatch: metav1.ResourceVersionMatchNotOlderThan}},
		{"Exact", &metainternalversion.ListOptions{ResourceVersion: "62703", ResourceVersionMatch: metav1.ResourceVersionMatchExact}},
		{"legacy", &metainternalversion.ListOptions{ResourceVersion: "62703", Limit: 10}},
		{"unset", &metainternalversion.ListOptions{}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			backend := &recordingListBackend{mockBackend: newMockBackend()}
			gs := newListOptionsTestStorage(backend)

			if _, err := gs.List(contextWithNamespace(testNS()), tc.in); err != nil {
				t.Fatalf("List() error = %v", err)
			}
			if backend.opts.ResourceVersion != tc.in.ResourceVersion {
				t.Errorf("ResourceVersion = %q, want %q", backend.opts.ResourceVersion, tc.in.ResourceVersion)
			}
			if backend.opts.ResourceVersionMatch != tc.in.ResourceVersionMatch {
				t.Errorf("ResourceVersionMatch = %q, want %q", backend.opts.ResourceVersionMatch, tc.in.ResourceVersionMatch)
			}
			if backend.opts.Limit != tc.in.Limit {
				t.Errorf("Limit = %d, want %d", backend.opts.Limit, tc.in.Limit)
			}
		})
	}
}

func TestGenericStorage_List_TooLargeResourceVersionIsTimeout(t *testing.T) {
	t.Parallel()
	backend := newMockBackend()
	backend.err = fmt.Errorf("wrapped: %w", &storage.TooLargeResourceVersionError{Requested: 10, Current: 5})
	gs := newListOptionsTestStorage(backend)

	_, err := gs.List(contextWithNamespace(testNS()), &metainternalversion.ListOptions{
		ResourceVersion:      "10",
		ResourceVersionMatch: metav1.ResourceVersionMatchNotOlderThan,
	})
	if !apierrors.IsTimeout(err) {
		t.Fatalf("want a Timeout error, got %v", err)
	}
	if !k8sstorage.IsTooLargeResourceVersion(err) {
		t.Errorf("error lacks the ResourceVersionTooLarge cause: %v", err)
	}
	var status apierrors.APIStatus
	if !errors.As(err, &status) {
		t.Fatalf("error is not an APIStatus: %T", err)
	}
	if got := status.Status().Code; got != http.StatusGatewayTimeout {
		t.Errorf("code = %d, want %d", got, http.StatusGatewayTimeout)
	}
	if got, want := status.Status().Message, "Timeout: Too large resource version: 10, current: 5"; got != want {
		t.Errorf("message = %q, want %q", got, want)
	}
	if seconds, ok := apierrors.SuggestsClientDelay(err); !ok || seconds != 1 {
		t.Errorf("retry after = %d (present=%v), want 1", seconds, ok)
	}
}

func TestGenericStorage_List_ExpiredResourceVersionIsGone(t *testing.T) {
	t.Parallel()
	backend := newMockBackend()
	backend.err = fmt.Errorf("%w: resourceVersion 4 is below the store head 5", storage.ErrResourceExpired)
	gs := newListOptionsTestStorage(backend)

	_, err := gs.List(contextWithNamespace(testNS()), &metainternalversion.ListOptions{
		ResourceVersion:      "4",
		ResourceVersionMatch: metav1.ResourceVersionMatchExact,
	})
	if !apierrors.IsResourceExpired(err) {
		t.Fatalf("want a ResourceExpired (410) error, got %v", err)
	}
}

func TestGenericStorage_List_OtherErrorsStayInternal(t *testing.T) {
	t.Parallel()
	backend := newMockBackend()
	backend.err = errors.New("connection reset")
	gs := newListOptionsTestStorage(backend)

	_, err := gs.List(contextWithNamespace(testNS()), &metainternalversion.ListOptions{})
	if !apierrors.IsInternalError(err) {
		t.Fatalf("want an InternalError, got %v", err)
	}
}

func TestGenericStorage_Get_ResourceVersion(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name         string
		rv           string
		requireErr   error
		wantRequired uint64
		check        func(error) bool
	}{
		{name: "unset", rv: "", check: func(err error) bool { return err == nil }},
		{name: "zero", rv: "0", check: func(err error) bool { return err == nil }},
		{name: "reached", rv: "7", wantRequired: 7, check: func(err error) bool { return err == nil }},
		{name: "ahead of the store", rv: "9", requireErr: &storage.TooLargeResourceVersionError{Requested: 9, Current: 8}, wantRequired: 9, check: k8sstorage.IsTooLargeResourceVersion},
		{name: "malformed", rv: "abc", check: apierrors.IsBadRequest},
		{name: "backend failure", rv: "7", requireErr: errors.New("connection reset"), wantRequired: 7, check: apierrors.IsInternalError},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			backend := newMockBackend()
			backend.requireErr = tc.requireErr
			agent := &arkv1alpha1.Agent{}
			agent.Name = testAgentName
			agent.Namespace = testNS()
			backend.objects["Agent/default/"+testAgentName] = agent
			gs := newListOptionsTestStorage(backend)

			_, err := gs.Get(contextWithNamespace(testNS()), testAgentName, &metav1.GetOptions{ResourceVersion: tc.rv})
			if !tc.check(err) {
				t.Fatalf("Get() error = %v", err)
			}
			if backend.requiredRV != tc.wantRequired {
				t.Errorf("RequireResourceVersion got %d, want %d", backend.requiredRV, tc.wantRequired)
			}
		})
	}
}

func TestStatusStorage_Get_ResourceVersionAheadOfTheStore(t *testing.T) {
	t.Parallel()
	ss, backend := newTestStatusStorage()
	backend.requireErr = &storage.TooLargeResourceVersionError{Requested: 9, Current: 8}

	_, err := ss.Get(contextWithNamespace(testNS()), testAgentName, &metav1.GetOptions{ResourceVersion: "9"})
	if !k8sstorage.IsTooLargeResourceVersion(err) {
		t.Fatalf("want a too large resource version error, got %v", err)
	}
	if backend.requiredRV != 9 {
		t.Errorf("RequireResourceVersion got %d, want 9", backend.requiredRV)
	}
}

type tooLargeWatchBackend struct {
	*mockBackend
}

func (b *tooLargeWatchBackend) Watch(ctx context.Context, kind, namespace string, opts storage.WatchOptions) (watch.Interface, error) {
	return nil, &storage.TooLargeResourceVersionError{Requested: 11, Current: 10}
}

func TestGenericStorage_Watch_TooLargeIsAnErrorEvent(t *testing.T) {
	t.Parallel()
	yes := true
	gs := newListOptionsTestStorage(&tooLargeWatchBackend{mockBackend: newMockBackend()})

	w, err := gs.Watch(contextWithNamespace(testNS()), &metainternalversion.ListOptions{
		ResourceVersion:      "11",
		ResourceVersionMatch: metav1.ResourceVersionMatchNotOlderThan,
		SendInitialEvents:    &yes,
		AllowWatchBookmarks:  true,
	})
	if err != nil {
		t.Fatalf("Watch() error = %v, want an error event in the stream", err)
	}
	defer w.Stop()

	ev, ok := <-w.ResultChan()
	if !ok {
		t.Fatal("watch closed without an event")
	}
	if ev.Type != watch.Error {
		t.Fatalf("event type = %s, want %s", ev.Type, watch.Error)
	}
	status, ok := ev.Object.(*metav1.Status)
	if !ok {
		t.Fatalf("event object = %T, want *metav1.Status", ev.Object)
	}
	statusErr := &apierrors.StatusError{ErrStatus: *status}
	if !k8sstorage.IsTooLargeResourceVersion(statusErr) {
		t.Errorf("status is not a too large resource version error: %+v", status)
	}
	if status.Code != http.StatusGatewayTimeout {
		t.Errorf("code = %d, want %d", status.Code, http.StatusGatewayTimeout)
	}
	if _, ok := <-w.ResultChan(); ok {
		t.Error("watch kept streaming after the error event")
	}
}

func TestStorageOutcome(t *testing.T) {
	t.Parallel()
	tests := map[string]error{
		"rejected": &storage.TooLargeResourceVersionError{Requested: 2, Current: 1},
		"error":    errors.New("connection reset"),
	}
	for want, err := range tests {
		if got := storageOutcome(err); got != want {
			t.Errorf("storageOutcome(%v) = %q, want %q", err, got, want)
		}
	}
	for _, err := range []error{
		fmt.Errorf("%w: bad", storage.ErrInvalidRequest),
		fmt.Errorf("%w: old", storage.ErrResourceExpired),
	} {
		if got := storageOutcome(err); got != "rejected" {
			t.Errorf("storageOutcome(%v) = %q, want rejected", err, got)
		}
	}
}
