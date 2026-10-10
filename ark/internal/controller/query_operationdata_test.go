/* Copyright 2025. McKinsey & Company */

package controller

import (
	"testing"

	"github.com/stretchr/testify/assert"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

// Must stay in sync with the completions executor's AgentExecution event
// (executors/completions/agent.go: operationData["agent"] = a.Name). Divergent
// forms let the broker record two participant strings per agent under
// event-order race, which the dashboard reads as a workflow conversation.
func TestBuildOperationData_EmitsBareTargetName(t *testing.T) {
	tests := []struct {
		name       string
		targetType string
		wantKey    string
	}{
		{"agent target", "agent", "agent"},
		{"team target", "team", "team"},
		{"tool target", "tool", "tool"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			target := &arkv1alpha1.QueryTarget{Type: tt.targetType, Name: "my-target"}
			data := buildOperationData(target, "")
			assert.Equal(t, "my-target", data[tt.wantKey], "expected bare Name")
			assert.Equal(t, tt.targetType, data["targetType"])
		})
	}
}
