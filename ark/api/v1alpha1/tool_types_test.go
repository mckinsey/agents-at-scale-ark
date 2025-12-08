/* Copyright 2025. McKinsey & Company */

package v1alpha1

import (
	"testing"

	"github.com/stretchr/testify/require"
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
