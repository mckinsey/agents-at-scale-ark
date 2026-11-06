/* Copyright 2025. McKinsey & Company */

package registry

import (
	"context"
	"testing"

	metainternalversion "k8s.io/apimachinery/pkg/apis/meta/internalversion"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/watch"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/storage"
)

type recordingWatchBackend struct {
	*mockBackend
	opts storage.WatchOptions
}

func (b *recordingWatchBackend) Watch(ctx context.Context, kind, namespace string, opts storage.WatchOptions) (watch.Interface, error) {
	b.opts = opts
	return b.mockBackend.Watch(ctx, kind, namespace, opts)
}

func TestGenericStorage_Watch_PassesWatchListOptionsToTheBackend(t *testing.T) {
	t.Parallel()
	yes, no := true, false
	tests := []struct {
		name          string
		in            *metainternalversion.ListOptions
		wantInitial   bool
		wantBookmarks bool
	}{
		{"resumed watch", &metainternalversion.ListOptions{ResourceVersion: "5", AllowWatchBookmarks: true}, false, true},
		{"watchlist", &metainternalversion.ListOptions{AllowWatchBookmarks: true, SendInitialEvents: &yes}, true, true},
		{"sendInitialEvents false", &metainternalversion.ListOptions{AllowWatchBookmarks: true, SendInitialEvents: &no}, false, true},
		{"no options", &metainternalversion.ListOptions{}, false, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			backend := &recordingWatchBackend{mockBackend: newMockBackend()}
			gs := NewGenericStorage(backend, &mockConverter{}, ResourceConfig{
				Kind:         "Agent",
				Resource:     "agents",
				SingularName: "agent",
				NewFunc:      func() runtime.Object { return &arkv1alpha1.Agent{} },
				NewListFunc:  func() runtime.Object { return &arkv1alpha1.AgentList{} },
			}, nil)

			w, err := gs.Watch(contextWithNamespace(testNS()), tc.in)
			if err != nil {
				t.Fatalf("Watch() error = %v", err)
			}
			w.Stop()

			if backend.opts.SendInitialEvents != tc.wantInitial {
				t.Errorf("SendInitialEvents = %v, want %v", backend.opts.SendInitialEvents, tc.wantInitial)
			}
			if backend.opts.AllowWatchBookmarks != tc.wantBookmarks {
				t.Errorf("AllowWatchBookmarks = %v, want %v", backend.opts.AllowWatchBookmarks, tc.wantBookmarks)
			}
			if backend.opts.ResourceVersion != tc.in.ResourceVersion {
				t.Errorf("ResourceVersion = %q, want %q", backend.opts.ResourceVersion, tc.in.ResourceVersion)
			}
		})
	}
}
