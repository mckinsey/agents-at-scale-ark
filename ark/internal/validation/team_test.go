//nolint:goconst
package validation

import (
	"context"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arka2a "mckinsey.com/ark/internal/a2a"
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
		maxTurns := 10
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "selector",
				MaxTurns: &maxTurns,
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

	t.Run("selector strategy requires maxTurns", func(t *testing.T) {
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
		if err == nil {
			t.Fatal("expected error for missing maxTurns")
		}
	})

	t.Run("sequential with loops requires maxTurns", func(t *testing.T) {
		loopsTrue := true
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "sequential",
				Loops:    &loopsTrue,
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
		loopsTrue := true
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "sequential",
				Loops:    &loopsTrue,
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
		loopsTrue := true
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
			Spec: arkv1alpha1.TeamSpec{
				Strategy: "selector",
				Loops:    &loopsTrue,
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
}

func TestValidateNoMixedTeam(t *testing.T) {
	engineAgent := func(engine string) *arkv1alpha1.Agent {
		agent := &arkv1alpha1.Agent{}
		if engine != "" {
			agent.Spec.ExecutionEngine = &arkv1alpha1.ExecutionEngineRef{Name: engine}
		}
		return agent
	}

	tests := []struct {
		name       string
		agents     map[string]*arkv1alpha1.Agent
		wantReject bool
	}{
		{
			name:   "all internal agents",
			agents: map[string]*arkv1alpha1.Agent{"a": engineAgent(""), "b": engineAgent("")},
		},
		{
			name:   "all external agents",
			agents: map[string]*arkv1alpha1.Agent{"a": engineAgent("mock-engine"), "b": engineAgent("mock-engine")},
		},
		{
			name:   "a2a agents count as internal",
			agents: map[string]*arkv1alpha1.Agent{"a": engineAgent(arka2a.ExecutionEngineA2A), "b": engineAgent("")},
		},
		{
			name:       "internal beside external is rejected",
			agents:     map[string]*arkv1alpha1.Agent{"a": engineAgent(""), "b": engineAgent("mock-engine")},
			wantReject: true,
		},
		{
			name:       "a2a beside a named engine is rejected",
			agents:     map[string]*arkv1alpha1.Agent{"a": engineAgent(arka2a.ExecutionEngineA2A), "b": engineAgent("mock-engine")},
			wantReject: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			lookup := newMockLookup()
			members := make([]arkv1alpha1.TeamMember, 0, len(tt.agents))
			for _, name := range []string{"a", "b"} {
				lookup.addResource("Agent", "default", name, tt.agents[name])
				members = append(members, arkv1alpha1.TeamMember{Name: name, Type: "agent"})
			}

			team := &arkv1alpha1.Team{
				ObjectMeta: metav1.ObjectMeta{Name: "t", Namespace: "default"},
				Spec:       arkv1alpha1.TeamSpec{Strategy: "sequential", Members: members},
			}

			err := NewValidator(lookup).validateNoMixedTeam(context.Background(), team)
			if tt.wantReject {
				if err == nil {
					t.Fatal("expected a mixed-team rejection")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}
