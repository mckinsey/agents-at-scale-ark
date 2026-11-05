/* Copyright 2025. McKinsey & Company */

package registry

import (
	"context"
	"errors"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/watch"
	k8sstorage "k8s.io/apiserver/pkg/storage"

	"mckinsey.com/ark/internal/storage"
)

const tooLargeResourceVersionRetrySeconds = 1

func resourceVersionError(err error) error {
	var tooLarge *storage.TooLargeResourceVersionError
	switch {
	case errors.Is(err, storage.ErrInvalidRequest):
		return apierrors.NewBadRequest(err.Error())
	case errors.As(err, &tooLarge):
		return k8sstorage.NewTooLargeResourceVersionError(tooLarge.Requested, uint64(max(tooLarge.Current, 0)), tooLargeResourceVersionRetrySeconds)
	case errors.Is(err, storage.ErrResourceExpired):
		return apierrors.NewResourceExpired(err.Error())
	default:
		return nil
	}
}

func classifyStorageError(err, internal error) (string, error) {
	if apiErr := resourceVersionError(err); apiErr != nil {
		return "rejected", apiErr
	}
	return "error", apierrors.NewInternalError(internal)
}

func requireResourceVersion(ctx context.Context, backend storage.Backend, options *metav1.GetOptions) error {
	if options == nil {
		return nil
	}
	minRV, err := storage.ParseMinResourceVersion(options.ResourceVersion)
	if err != nil {
		return err
	}
	return backend.RequireResourceVersion(ctx, minRV)
}

func errorWatcher(err error) watch.Interface {
	var status apierrors.APIStatus
	ch := make(chan watch.Event, 1)
	if errors.As(err, &status) {
		s := status.Status()
		ch <- watch.Event{Type: watch.Error, Object: &s}
	}
	close(ch)
	return watch.NewProxyWatcher(ch)
}
