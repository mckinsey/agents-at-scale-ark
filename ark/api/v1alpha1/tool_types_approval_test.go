package v1alpha1

import "testing"

// ToolSpec declares its own DeepCopyInto, so controller-gen skips it and a new
// pointer field is not copied unless it is added by hand.
func TestToolSpecDeepCopyDoesNotAliasApproval(t *testing.T) {
	original := &Tool{
		Spec: ToolSpec{
			Type:     "mcp",
			Approval: &ToolApprovalConfig{Required: true, OnTimeout: "reject"},
		},
	}

	copied := original.DeepCopy()
	if copied.Spec.Approval == original.Spec.Approval {
		t.Fatal("approval pointer is shared between the copy and the original")
	}

	copied.Spec.Approval.Required = false
	copied.Spec.Approval.OnTimeout = "proceed"

	if !original.Spec.Approval.Required {
		t.Error("mutating the copy disabled the gate on the original")
	}
	if original.Spec.Approval.OnTimeout != "reject" {
		t.Errorf("mutating the copy changed the original onTimeout to %q", original.Spec.Approval.OnTimeout)
	}
}
