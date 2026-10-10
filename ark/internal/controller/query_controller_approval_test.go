/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/annotations"
)

func TestCreateErrorResponse(t *testing.T) {
	target := arkv1alpha1.QueryTarget{Type: "agent", Name: "my-agent"}

	resp := createErrorResponse(target, fmt.Errorf("boom"))

	require.NotNil(t, resp)
	assert.Equal(t, statusError, resp.Phase)
	assert.Equal(t, "boom", resp.Content)
	assert.Equal(t, target, resp.Target)
	assert.Contains(t, resp.Raw, "target_execution_error")
	assert.Contains(t, resp.Raw, "boom")
}

func TestDetermineQueryStatus(t *testing.T) {
	r := &QueryReconciler{}

	tests := []struct {
		name     string
		response *arkv1alpha1.Response
		expected string
	}{
		{name: "nil response defaults to done", response: nil, expected: statusDone},
		{name: "error phase", response: &arkv1alpha1.Response{Phase: statusError}, expected: statusError},
		{name: "input-required phase", response: &arkv1alpha1.Response{Phase: statusInputRequired}, expected: statusInputRequired},
		{name: "done phase", response: &arkv1alpha1.Response{Phase: statusDone}, expected: statusDone},
		{name: "unknown phase defaults to done", response: &arkv1alpha1.Response{Phase: "weird"}, expected: statusDone},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expected, r.determineQueryStatus(tt.response))
		})
	}
}

func TestReadApprovalCascadeCount(t *testing.T) {
	tests := []struct {
		name        string
		annotations map[string]string
		expected    int
	}{
		{name: "nil annotations", annotations: nil, expected: 0},
		{name: "missing annotation", annotations: map[string]string{"other": "1"}, expected: 0},
		{name: "valid count", annotations: map[string]string{annotations.ApprovalCascadeCount: "2"}, expected: 2},
		{name: "unparseable count resets to zero", annotations: map[string]string{annotations.ApprovalCascadeCount: "nope"}, expected: 0},
		{name: "negative count resets to zero", annotations: map[string]string{annotations.ApprovalCascadeCount: "-1"}, expected: 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			query := &arkv1alpha1.Query{ObjectMeta: metav1.ObjectMeta{Annotations: tt.annotations}}
			assert.Equal(t, tt.expected, readApprovalCascadeCount(query))
		})
	}
}

func TestIncrementApprovalCascadeCount(t *testing.T) {
	query := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{Name: "q1", Namespace: "default"},
	}
	client := fake.NewClientBuilder().WithScheme(newTestScheme()).WithObjects(query).Build()
	r := &QueryReconciler{Client: client, Scheme: client.Scheme()}

	require.NoError(t, r.incrementApprovalCascadeCount(context.Background(), query, 1))

	updated := &arkv1alpha1.Query{}
	require.NoError(t, client.Get(context.Background(), types.NamespacedName{Name: "q1", Namespace: "default"}, updated))
	assert.Equal(t, "2", updated.Annotations[annotations.ApprovalCascadeCount])
}

func TestResetApprovalCascadeCount(t *testing.T) {
	t.Run("no-op when annotation absent", func(t *testing.T) {
		query := &arkv1alpha1.Query{ObjectMeta: metav1.ObjectMeta{Name: "q1", Namespace: "default"}}
		client := fake.NewClientBuilder().WithScheme(newTestScheme()).WithObjects(query).Build()
		r := &QueryReconciler{Client: client, Scheme: client.Scheme()}

		require.NoError(t, r.resetApprovalCascadeCount(context.Background(), query))
	})

	t.Run("removes annotation when present", func(t *testing.T) {
		query := &arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{
				Name:        "q1",
				Namespace:   "default",
				Annotations: map[string]string{annotations.ApprovalCascadeCount: "3"},
			},
		}
		client := fake.NewClientBuilder().WithScheme(newTestScheme()).WithObjects(query).Build()
		r := &QueryReconciler{Client: client, Scheme: client.Scheme()}

		require.NoError(t, r.resetApprovalCascadeCount(context.Background(), query))

		updated := &arkv1alpha1.Query{}
		require.NoError(t, client.Get(context.Background(), types.NamespacedName{Name: "q1", Namespace: "default"}, updated))
		_, present := updated.Annotations[annotations.ApprovalCascadeCount]
		assert.False(t, present, "cascade annotation should be removed")
	})
}
