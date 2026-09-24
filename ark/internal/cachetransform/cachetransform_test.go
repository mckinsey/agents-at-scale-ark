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

func TestStripQueryStripsHeavyFieldsInTerminalPhase(t *testing.T) {
	query := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{
			Name:            "q1",
			Namespace:       "default",
			ManagedFields:   managedFields(),
			OwnerReferences: []metav1.OwnerReference{{Name: "owner", Kind: "Agent"}},
		},
		Status: arkv1alpha1.QueryStatus{
			Phase:          arkv1alpha1.QueryPhaseDone,
			ConversationId: "conv-123",
			Conditions:     []metav1.Condition{{Type: "Completed", Status: metav1.ConditionTrue}},
			Response: &arkv1alpha1.Response{
				Target:  arkv1alpha1.QueryTarget{Name: "agent", Type: "agent"},
				Content: "the full and potentially very large LLM output",
				Raw:     "the even larger raw messages array",
				Phase:   arkv1alpha1.QueryPhaseDone,
				A2A:     &arkv1alpha1.A2AMetadata{TaskID: "task-1"},
			},
		},
	}

	out, err := StripQuery(query)
	require.NoError(t, err)

	got, ok := out.(*arkv1alpha1.Query)
	require.True(t, ok)

	assert.Nil(t, got.ManagedFields, "managedFields must be stripped")
	assert.Empty(t, got.Status.Response.Content, "response content must be stripped on terminal queries")
	assert.Empty(t, got.Status.Response.Raw, "response raw must be stripped on terminal queries")

	assert.Equal(t, "conv-123", got.Status.ConversationId)
	assert.Equal(t, arkv1alpha1.QueryPhaseDone, got.Status.Phase)
	assert.Len(t, got.Status.Conditions, 1)
	assert.Len(t, got.OwnerReferences, 1)
	assert.Equal(t, arkv1alpha1.QueryPhaseDone, got.Status.Response.Phase)
	assert.Equal(t, "agent", got.Status.Response.Target.Name)
	require.NotNil(t, got.Status.Response.A2A)
	assert.Equal(t, "task-1", got.Status.Response.A2A.TaskID)
}

func TestStripQueryPreservesContentInNonTerminalPhase(t *testing.T) {
	// input-required carries a real Response that the HITL resume path re-persists
	// through a full Status().Update; stripping it here would write content: "" back
	// to etcd. Non-terminal queries must keep their heavy fields in the cache.
	query := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{Name: "q1", Namespace: "default", ManagedFields: managedFields()},
		Status: arkv1alpha1.QueryStatus{
			Phase: arkv1alpha1.QueryPhaseInputRequired,
			Response: &arkv1alpha1.Response{
				Content: "awaiting approval, keep me",
				Raw:     "raw messages, keep me too",
				Phase:   arkv1alpha1.QueryPhaseInputRequired,
			},
		},
	}

	out, err := StripQuery(query)
	require.NoError(t, err)

	got := out.(*arkv1alpha1.Query)
	assert.Nil(t, got.ManagedFields, "managedFields stripped regardless of phase")
	assert.Equal(t, "awaiting approval, keep me", got.Status.Response.Content)
	assert.Equal(t, "raw messages, keep me too", got.Status.Response.Raw)
}

func TestStripQueryWithNilResponse(t *testing.T) {
	query := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{Name: "q1", ManagedFields: managedFields()},
		Status:     arkv1alpha1.QueryStatus{Phase: arkv1alpha1.QueryPhaseDone},
	}

	out, err := StripQuery(query)
	require.NoError(t, err)

	got := out.(*arkv1alpha1.Query)
	assert.Nil(t, got.ManagedFields)
	assert.Nil(t, got.Status.Response)
	assert.Equal(t, arkv1alpha1.QueryPhaseDone, got.Status.Phase)
}

func TestStripQueryReturnsNonQueryUntouched(t *testing.T) {
	// In production only *Query is routed to StripQuery; the non-Query arm is a
	// pure passthrough that must not touch the object.
	agent := &arkv1alpha1.Agent{
		ObjectMeta: metav1.ObjectMeta{Name: "a1", ManagedFields: managedFields()},
		Status: arkv1alpha1.AgentStatus{
			Conditions: []metav1.Condition{{Type: "Ready", Status: metav1.ConditionTrue}},
		},
	}

	out, err := StripQuery(agent)
	require.NoError(t, err)

	got := out.(*arkv1alpha1.Agent)
	assert.Equal(t, agent, got, "non-Query object returned untouched")
}

func TestStripQueryHandlesDeletedFinalStateUnknown(t *testing.T) {
	inner := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{Name: "q1"},
		Status: arkv1alpha1.QueryStatus{
			Phase:    arkv1alpha1.QueryPhaseDone,
			Response: &arkv1alpha1.Response{Content: "must survive", Raw: "must survive too"},
		},
	}
	tombstone := toolscache.DeletedFinalStateUnknown{Key: "default/q1", Obj: inner.DeepCopy()}

	out, err := StripQuery(tombstone)
	require.NoError(t, err)

	got, ok := out.(toolscache.DeletedFinalStateUnknown)
	require.True(t, ok)
	gotInner, ok := got.Obj.(*arkv1alpha1.Query)
	require.True(t, ok)
	assert.Equal(t, "must survive", gotInner.Status.Response.Content, "tombstone inner object must not be stripped")
	assert.Equal(t, "must survive too", gotInner.Status.Response.Raw)
}

func TestStripManagedFieldsOnly(t *testing.T) {
	query := &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{Name: "q1", ManagedFields: managedFields()},
		Status: arkv1alpha1.QueryStatus{
			Phase:    arkv1alpha1.QueryPhaseDone,
			Response: &arkv1alpha1.Response{Content: "not touched here"},
		},
	}

	out, err := StripManagedFields(query)
	require.NoError(t, err)

	got := out.(*arkv1alpha1.Query)
	assert.Nil(t, got.ManagedFields)
	assert.Equal(t, "not touched here", got.Status.Response.Content, "StripManagedFields must not touch content")
}
