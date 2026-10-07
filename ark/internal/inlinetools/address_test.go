/* Copyright 2025. McKinsey & Company */

package inlinetools

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func availableInlineTool() *arkv1alpha1.Tool {
	tool := &arkv1alpha1.Tool{
		ObjectMeta: metav1.ObjectMeta{Name: "echo", Namespace: "tenant", UID: "tool-uid", Generation: 1},
		Spec:       arkv1alpha1.ToolSpec{Type: arkv1alpha1.ToolTypeInline, Inline: &arkv1alpha1.InlineSpec{Language: "bash", Source: "echo hi"}},
		Status: arkv1alpha1.ToolStatus{State: arkv1alpha1.ToolStateReady, Conditions: []metav1.Condition{{
			Type: arkv1alpha1.ToolConditionAvailable, Status: metav1.ConditionTrue, Reason: arkv1alpha1.ToolReasonAvailable, ObservedGeneration: 1,
		}}},
	}
	tool.Status.ResolvedAddress = ResolvedAddress(ActivatorBaseURL("ark-system"), tool)
	return tool
}

func TestPublishedEndpointAcceptsTheCanonicalAddress(t *testing.T) {
	tool := availableInlineTool()

	endpoint, err := PublishedEndpoint(ResolvedAddress(ActivatorBaseURL("ark-system"), tool), tool)
	require.NoError(t, err)
	assert.Equal(t, tool.Status.ResolvedAddress, endpoint)
}

func TestPublishedEndpointRejectsAForgedOrStaleAddress(t *testing.T) {
	cases := []struct {
		name     string
		expected string
	}{
		{"wrong activator namespace", ResolvedAddress(ActivatorBaseURL("other-namespace"), availableInlineTool())},
		{"arbitrary host", "http://attacker.example.com/mcp/tenant/echo/tool-uid"},
		{"empty expectation", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			tool := availableInlineTool()
			endpoint, err := PublishedEndpoint(tc.expected, tool)
			require.ErrorContains(t, err, "does not match the canonical activator address")
			assert.Empty(t, endpoint)
		})
	}
}
