/* Copyright 2025. McKinsey & Company */

package v1alpha1

import (
	"testing"

	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func TestTeamToolRef_DeepCopyInto(t *testing.T) {
	in := &TeamToolRef{
		Name: "test-team",
	}
	out := &TeamToolRef{}

	in.DeepCopyInto(out)

	require.Equal(t, in.Name, out.Name)
	require.Equal(t, "test-team", out.Name)
}

func TestToolSpec_DeepCopyInto_WithTeam(t *testing.T) {
	in := &ToolSpec{
		Type: ToolTypeTeam,
		Team: &TeamToolRef{
			Name: "test-team",
		},
	}
	out := &ToolSpec{}

	in.DeepCopyInto(out)

	require.NotNil(t, out.Team)
	require.Equal(t, in.Team.Name, out.Team.Name)
	require.Equal(t, "test-team", out.Team.Name)
	require.NotSame(t, in.Team, out.Team, "Team should be a new instance")
}

func TestToolSpec_DeepCopyInto_WithInline(t *testing.T) {
	in := &ToolSpec{
		Type:   ToolTypeInline,
		Inline: &InlineSpec{Source: "print(1)", Language: "python"},
	}
	out := &ToolSpec{}

	in.DeepCopyInto(out)

	require.NotSame(t, in.Inline, out.Inline)
	require.Equal(t, *in.Inline, *out.Inline)

	// A copy must not be able to rewrite the original's executable source.
	out.Inline.Source = "rm -rf /"
	require.Equal(t, "print(1)", in.Inline.Source)
}

func TestToolStatus_DeepCopy_ConditionsAreNotShared(t *testing.T) {
	in := &ToolStatus{
		State:           ToolStatePending,
		ResolvedAddress: "http://inline.svc",
		Conditions: []metav1.Condition{{
			Type:   ToolConditionAvailable,
			Status: metav1.ConditionFalse,
			Reason: ToolReasonRuntimeNotInstalled,
		}},
	}

	out := in.DeepCopy()
	out.Conditions[0].Reason = ToolReasonProvisioningFailed

	require.Equal(t, ToolReasonRuntimeNotInstalled, in.Conditions[0].Reason)
	require.Equal(t, "http://inline.svc", out.ResolvedAddress)
}
