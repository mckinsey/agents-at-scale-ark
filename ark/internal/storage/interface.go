/* Copyright 2025. McKinsey & Company */

package storage

import (
	"context"
	"errors"

	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/watch"
)

var (
	ErrNotFound = errors.New("not found")
	ErrConflict = errors.New("conflict: resource version mismatch")
)

type ListOptions struct {
	LabelSelector string
	FieldSelector string
	Limit         int64
	Continue      string
}

type WatchOptions struct {
	LabelSelector   string
	FieldSelector   string
	ResourceVersion string
}

type Backend interface {
	Create(ctx context.Context, kind, namespace, name string, obj runtime.Object) error
	Get(ctx context.Context, kind, namespace, name string) (runtime.Object, error)
	List(ctx context.Context, kind, namespace string, opts ListOptions) ([]runtime.Object, string, error)
	Update(ctx context.Context, kind, namespace, name string, obj runtime.Object) error
	UpdateStatus(ctx context.Context, kind, namespace, name string, obj runtime.Object) error
	Delete(ctx context.Context, kind, namespace, name string) error
	Watch(ctx context.Context, kind, namespace string, opts WatchOptions) (watch.Interface, error)
	GetResourceVersion(ctx context.Context, kind, namespace, name string) (int64, error)
	Close() error
}

type TypeConverter interface {
	NewObject(kind string) runtime.Object
	NewListObject(kind string) runtime.Object
	Encode(obj runtime.Object) ([]byte, error)
	Decode(kind string, data []byte) (runtime.Object, error)
	APIVersion(kind string) string
}
