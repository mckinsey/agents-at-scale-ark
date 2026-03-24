//nolint:goconst
package validation

import (
	"context"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func TestValidateTeam(t *testing.T) { //nolint:gocognit
	lookup := newMockLookup()
	lookup.addResource("Agent", "default", "agent1", &arkv1alpha1.Agent{})
	lookup.addResource("Agent", "default", "agent2", &arkv1alpha1.Agent{})
	lookup.addResource("Agent", "default", "coordinator", &arkv1alpha1.Agent{})
	lookup.addResource("Team", "default", "sub-team", &arkv1alpha1.Team{})
	v := NewValidator(lookup)
	ctx := context.Background()

	t.Run("valid sequential team", func(t *testing.T) {
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "sequential",
				Members: []arkv1alpha1.TeamMember{
					{Name: "agent1", Type: "agent"},
					{Name: "agent2", Type: "agent"},
				},
			},
		}
		_, err := v.ValidateTeam(ctx, team)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("valid round-robin team", func(t *testing.T) {
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "round-robin",
				Members: []arkv1alpha1.TeamMember{
					{Name: "agent1", Type: "agent"},
				},
			},
		}
		_, err := v.ValidateTeam(ctx, team)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects unsupported strategy", func(t *testing.T) {
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec:       arkv1alpha1.TeamSpec{Strategy: "unknown"},
		}
		_, err := v.ValidateTeam(ctx, team)
		if err == nil {
			t.Fatal("expected error for unsupported strategy")
		}
	})

	t.Run("rejects self-referencing member", func(t *testing.T) {
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "sequential",
				Members: []arkv1alpha1.TeamMember{
					{Name: "t", Type: "team"},
				},
			},
		}
		_, err := v.ValidateTeam(ctx, team)
		if err == nil {
			t.Fatal("expected error for self-reference")
		}
	})

	t.Run("rejects invalid member type", func(t *testing.T) {
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "sequential",
				Members: []arkv1alpha1.TeamMember{
					{Name: "agent1", Type: "invalid"},
				},
			},
		}
		_, err := v.ValidateTeam(ctx, team)
		if err == nil {
			t.Fatal("expected error for invalid member type")
		}
	})

	t.Run("rejects nonexistent agent member", func(t *testing.T) {
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "sequential",
				Members: []arkv1alpha1.TeamMember{
					{Name: "nonexistent", Type: "agent"},
				},
			},
		}
		_, err := v.ValidateTeam(ctx, team)
		if err == nil {
			t.Fatal("expected error for nonexistent member")
		}
	})

	t.Run("accepts team member type", func(t *testing.T) {
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "sequential",
				Members: []arkv1alpha1.TeamMember{
					{Name: "sub-team", Type: "team"},
				},
			},
		}
		_, err := v.ValidateTeam(ctx, team)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("selector requires selector.agent", func(t *testing.T) {
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "selector",
				Members: []arkv1alpha1.TeamMember{
					{Name: "agent1", Type: "agent"},
				},
			},
		}
		_, err := v.ValidateTeam(ctx, team)
		if err == nil {
			t.Fatal("expected error for missing selector.agent")
		}
	})

	t.Run("valid selector team", func(t *testing.T) {
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "selector",
				Members: []arkv1alpha1.TeamMember{
					{Name: "agent1", Type: "agent"},
				},
				Selector: &arkv1alpha1.TeamSelectorSpec{Agent: "coordinator"},
			},
		}
		_, err := v.ValidateTeam(ctx, team)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("graph strategy requires graph config", func(t *testing.T) {
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "graph",
				Members: []arkv1alpha1.TeamMember{
					{Name: "agent1", Type: "agent"},
				},
			},
		}
		_, err := v.ValidateTeam(ctx, team)
		if err == nil {
			t.Fatal("expected error for missing graph config")
		}
	})

	t.Run("graph strategy requires at least one edge", func(t *testing.T) {
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "graph",
				Members: []arkv1alpha1.TeamMember{
					{Name: "agent1", Type: "agent"},
				},
				Graph: &arkv1alpha1.TeamGraphSpec{},
			},
		}
		_, err := v.ValidateTeam(ctx, team)
		if err == nil {
			t.Fatal("expected error for empty edges")
		}
	})

	t.Run("graph rejects invalid from member", func(t *testing.T) {
		maxTurns := 10
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "graph",
				Members: []arkv1alpha1.TeamMember{
					{Name: "agent1", Type: "agent"},
				},
				Graph: &arkv1alpha1.TeamGraphSpec{
					Edges: []arkv1alpha1.TeamGraphEdge{{From: "unknown", To: "agent1"}},
				},
				MaxTurns: &maxTurns,
			},
		}
		_, err := v.ValidateTeam(ctx, team)
		if err == nil {
			t.Fatal("expected error for invalid from member")
		}
	})

	t.Run("graph rejects invalid to member", func(t *testing.T) {
		maxTurns := 10
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "graph",
				Members: []arkv1alpha1.TeamMember{
					{Name: "agent1", Type: "agent"},
				},
				Graph: &arkv1alpha1.TeamGraphSpec{
					Edges: []arkv1alpha1.TeamGraphEdge{{From: "agent1", To: "unknown"}},
				},
				MaxTurns: &maxTurns,
			},
		}
		_, err := v.ValidateTeam(ctx, team)
		if err == nil {
			t.Fatal("expected error for invalid to member")
		}
	})

	t.Run("graph rejects duplicate outgoing edges", func(t *testing.T) {
		maxTurns := 10
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "graph",
				Members: []arkv1alpha1.TeamMember{
					{Name: "agent1", Type: "agent"},
					{Name: "agent2", Type: "agent"},
				},
				Graph: &arkv1alpha1.TeamGraphSpec{
					Edges: []arkv1alpha1.TeamGraphEdge{
						{From: "agent1", To: "agent2"},
						{From: "agent1", To: "agent2"},
					},
				},
				MaxTurns: &maxTurns,
			},
		}
		_, err := v.ValidateTeam(ctx, team)
		if err == nil {
			t.Fatal("expected error for duplicate outgoing edges")
		}
	})

	t.Run("graph requires maxTurns", func(t *testing.T) {
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "graph",
				Members: []arkv1alpha1.TeamMember{
					{Name: "agent1", Type: "agent"},
					{Name: "agent2", Type: "agent"},
				},
				Graph: &arkv1alpha1.TeamGraphSpec{
					Edges: []arkv1alpha1.TeamGraphEdge{
						{From: "agent1", To: "agent2"},
					},
				},
			},
		}
		_, err := v.ValidateTeam(ctx, team)
		if err == nil {
			t.Fatal("expected error for missing maxTurns")
		}
	})

	t.Run("valid graph team", func(t *testing.T) {
		maxTurns := 10
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "graph",
				Members: []arkv1alpha1.TeamMember{
					{Name: "agent1", Type: "agent"},
					{Name: "agent2", Type: "agent"},
				},
				Graph: &arkv1alpha1.TeamGraphSpec{
					Edges: []arkv1alpha1.TeamGraphEdge{
						{From: "agent1", To: "agent2"},
					},
				},
				MaxTurns: &maxTurns,
			},
		}
		_, err := v.ValidateTeam(ctx, team)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("sequential with loops requires maxTurns", func(t *testing.T) {
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "sequential",
				Loops:    true,
				Members: []arkv1alpha1.TeamMember{
					{Name: "agent1", Type: "agent"},
				},
			},
		}
		_, err := v.ValidateTeam(ctx, team)
		if err == nil {
			t.Fatal("expected error for loops without maxTurns")
		}
	})

	t.Run("sequential maxTurns rejected without loops", func(t *testing.T) {
		maxTurns := 5
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "sequential",
				MaxTurns: &maxTurns,
				Members: []arkv1alpha1.TeamMember{
					{Name: "agent1", Type: "agent"},
				},
			},
		}
		_, err := v.ValidateTeam(ctx, team)
		if err == nil {
			t.Fatal("expected error for maxTurns without loops")
		}
	})

	t.Run("valid sequential with loops and maxTurns", func(t *testing.T) {
		maxTurns := 5
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "sequential",
				Loops:    true,
				MaxTurns: &maxTurns,
				Members: []arkv1alpha1.TeamMember{
					{Name: "agent1", Type: "agent"},
				},
			},
		}
		_, err := v.ValidateTeam(ctx, team)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("loops rejected on non-sequential strategy", func(t *testing.T) {
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "selector",
				Loops:    true,
				Members: []arkv1alpha1.TeamMember{
					{Name: "agent1", Type: "agent"},
				},
				Selector: &arkv1alpha1.TeamSelectorSpec{Agent: "coordinator"},
			},
		}
		_, err := v.ValidateTeam(ctx, team)
		if err == nil {
			t.Fatal("expected error for loops on selector strategy")
		}
	})

	t.Run("loops rejected on graph strategy", func(t *testing.T) {
		maxTurns := 10
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "graph",
				Loops:    true,
				MaxTurns: &maxTurns,
				Members: []arkv1alpha1.TeamMember{
					{Name: "agent1", Type: "agent"},
					{Name: "agent2", Type: "agent"},
				},
				Graph: &arkv1alpha1.TeamGraphSpec{
					Edges: []arkv1alpha1.TeamGraphEdge{
						{From: "agent1", To: "agent2"},
					},
				},
			},
		}
		_, err := v.ValidateTeam(ctx, team)
		if err == nil {
			t.Fatal("expected error for loops on graph strategy")
		}
	})
}
