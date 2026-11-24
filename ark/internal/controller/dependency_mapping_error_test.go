/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
	"sigs.k8s.io/controller-runtime/pkg/client/interceptor"
)

func TestMapDependencyRequests_ListErrorReturnsNil(t *testing.T) {
	c := fake.NewClientBuilder().WithScheme(newTestScheme()).
		WithInterceptorFuncs(interceptor.Funcs{
			List: func(_ context.Context, _ client.WithWatch, _ client.ObjectList, _ ...client.ListOption) error {
				return errors.New("boom-list")
			},
		}).Build()
	r := &MemoryReconciler{Client: c, Scheme: c.Scheme()}

	secret := &corev1.Secret{ObjectMeta: metav1.ObjectMeta{Name: "s", Namespace: "default"}}
	requests := r.mapSecretToMemories(context.Background(), secret)

	require.Nil(t, requests)
}
