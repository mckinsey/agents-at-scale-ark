/* Copyright 2025. McKinsey & Company */

package cachetransform

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	toolscache "k8s.io/client-go/tools/cache"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func managedFields() []metav1.ManagedFieldsEntry {
	return []metav1.ManagedFieldsEntry{{Manager: "controller", Operation: metav1.ManagedFieldsOperationUpdate}}
}

func TestStripQueryStripsHeavyFieldsAndPreservesTheRest(t *testing.T) {
	query := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{
			Name:            "q1",
			Namespace:       "default",
			ManagedFields:   managedFields(),
			OwnerReferences: []metav1.OwnerReference{{Name: "owner", Kind: "Agent"}},
		},
		Status: arkv1alpha1.QueryStatus{
			Phase:          "done",
			ConversationId: "conv-123",
			Conditions:     []metav1.Condition{{Type: "Completed", Status: metav1.ConditionTrue}},
			Response: &arkv1alpha1.Response{
				Target:  arkv1alpha1.QueryTarget{Name: "agent", Type: "agent"},
				Content: "the full and potentially very large LLM output",
				Raw:     "raw payload",
				Phase:   "done",
				A2A:     &arkv1alpha1.A2AMetadata{TaskID: "task-1"},
			},
		},
	}

	out, err := StripQuery()(query)
	require.NoError(t, err)

	got, ok := out.(*arkv1alpha1.Query)
	require.True(t, ok)

	assert.Nil(t, got.ManagedFields, "managedFields must be stripped")
	assert.Empty(t, got.Status.Response.Content, "response content must be stripped")

	assert.Equal(t, "conv-123", got.Status.ConversationId)
	assert.Equal(t, "done", got.Status.Phase)
	assert.Len(t, got.Status.Conditions, 1)
	assert.Len(t, got.OwnerReferences, 1)
	assert.Equal(t, "raw payload", got.Status.Response.Raw)
	assert.Equal(t, "done", got.Status.Response.Phase)
	assert.Equal(t, "agent", got.Status.Response.Target.Name)
	require.NotNil(t, got.Status.Response.A2A)
	assert.Equal(t, "task-1", got.Status.Response.A2A.TaskID)
}

func TestStripQueryWithNilResponse(t *testing.T) {
	query := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{Name: "q1", ManagedFields: managedFields()},
		Status:     arkv1alpha1.QueryStatus{Phase: "running"},
	}

	out, err := StripQuery()(query)
	require.NoError(t, err)

	got := out.(*arkv1alpha1.Query)
	assert.Nil(t, got.ManagedFields)
	assert.Nil(t, got.Status.Response)
	assert.Equal(t, "running", got.Status.Phase)
}

func TestStripQueryFallsBackForNonQuery(t *testing.T) {
	agent := &arkv1alpha1.Agent{
		ObjectMeta: metav1.ObjectMeta{Name: "a1", ManagedFields: managedFields()},
		Status: arkv1alpha1.AgentStatus{
			Conditions: []metav1.Condition{{Type: "Ready", Status: metav1.ConditionTrue}},
		},
	}

	out, err := StripQuery()(agent)
	require.NoError(t, err)

	got := out.(*arkv1alpha1.Agent)
	assert.Nil(t, got.ManagedFields, "managedFields stripped on non-Query too")
	assert.Len(t, got.Status.Conditions, 1, "non-Query status left intact")
}

func TestStripQueryHandlesDeletedFinalStateUnknown(t *testing.T) {
	tombstone := toolscache.DeletedFinalStateUnknown{
		Key: "default/q1",
		Obj: &arkv1alpha1.Query{ObjectMeta: metav1.ObjectMeta{Name: "q1"}},
	}

	out, err := StripQuery()(tombstone)
	require.NoError(t, err)
	assert.Equal(t, tombstone, out)
}

func TestStripManagedFieldsOnly(t *testing.T) {
	query := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{Name: "q1", ManagedFields: managedFields()},
		Status: arkv1alpha1.QueryStatus{
			Response: &arkv1alpha1.Response{Content: "not touched here"},
		},
	}

	out, err := StripManagedFields()(query)
	require.NoError(t, err)

	got := out.(*arkv1alpha1.Query)
	assert.Nil(t, got.ManagedFields)
	assert.Equal(t, "not touched here", got.Status.Response.Content, "StripManagedFields must not touch content")
}
