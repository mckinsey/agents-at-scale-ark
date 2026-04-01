/* Copyright 2025. McKinsey & Company */

package v1

import (
	"context"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/validation"
)

var _ = Describe("Team Webhook", func() {
	var (
		obj       *arkv1alpha1.Team
		oldObj    *arkv1alpha1.Team
		validator *validation.WebhookValidator
		ctx       context.Context
	)

	BeforeEach(func() {
		ctx = context.Background()

		// Setup scheme
		s := runtime.NewScheme()
		Expect(arkv1alpha1.AddToScheme(s)).To(Succeed())

		// Create all agents that are referenced in tests
		agents := []*arkv1alpha1.Agent{
			{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "coordinator",
					Namespace: "default",
				},
				Spec: arkv1alpha1.AgentSpec{
					Description: "Coordinator agent for selector",
					Prompt:      "You are a coordinator",
				},
			},
			{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "researcher",
					Namespace: "default",
				},
				Spec: arkv1alpha1.AgentSpec{
					Description: "Researcher agent",
					Prompt:      "You are a researcher",
				},
			},
			{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "analyst",
					Namespace: "default",
				},
				Spec: arkv1alpha1.AgentSpec{
					Description: "Analyst agent",
					Prompt:      "You are an analyst",
				},
			},
			{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "writer",
					Namespace: "default",
				},
				Spec: arkv1alpha1.AgentSpec{
					Description: "Writer agent",
					Prompt:      "You are a writer",
				},
			},
		}

		// Convert to []client.Object for fake client
		objects := make([]client.Object, len(agents))
		for i, agent := range agents {
			objects[i] = agent
		}

		// Create fake client with all agents
		fakeClient := fake.NewClientBuilder().WithScheme(s).WithObjects(objects...).Build()

		validator = &validation.WebhookValidator{
			V: validation.NewValidator(&validation.WebhookLookup{Client: fakeClient}),
		}

		obj = &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "test-team",
				Namespace: "default",
			},
		}
		oldObj = &arkv1alpha1.Team{}
		Expect(validator).NotTo(BeNil(), "Expected validator to be initialized")
		Expect(oldObj).NotTo(BeNil(), "Expected oldObj to be initialized")
		Expect(obj).NotTo(BeNil(), "Expected obj to be initialized")
	})

	Context("Selector strategy with graph constraints", func() {
		It("Should allow multiple edges from same source for selector strategy", func() {
			By("creating a selector team with graph that has multiple edges from same source")
			obj.Spec.Strategy = validation.StrategySelector
			obj.Spec.Members = []arkv1alpha1.TeamMember{
				{Name: "researcher", Type: "agent"},
				{Name: "analyst", Type: "agent"},
				{Name: "writer", Type: "agent"},
			}
			obj.Spec.Selector = &arkv1alpha1.TeamSelectorSpec{
				Agent: "coordinator",
			}
			obj.Spec.Graph = &arkv1alpha1.TeamGraphSpec{
				Edges: []arkv1alpha1.TeamGraphEdge{
					{From: "researcher", To: "analyst"},
					{From: "researcher", To: "writer"}, // Multiple edges from same source - allowed for selector
					{From: "analyst", To: "writer"},
				},
			}

			_, err := validator.ValidateCreate(ctx, obj)
			Expect(err).ToNot(HaveOccurred(), "selector strategy with graph should allow multiple edges from same source")
		})

		It("Should reject graph edges with invalid member names for selector strategy", func() {
			By("creating a selector team with graph referencing non-existent members")
			obj.Spec.Strategy = validation.StrategySelector
			obj.Spec.Members = []arkv1alpha1.TeamMember{
				{Name: "researcher", Type: "agent"},
			}
			obj.Spec.Selector = &arkv1alpha1.TeamSelectorSpec{
				Agent: "coordinator",
			}
			obj.Spec.Graph = &arkv1alpha1.TeamGraphSpec{
				Edges: []arkv1alpha1.TeamGraphEdge{
					{From: "researcher", To: "nonexistent"}, // Invalid member name
				},
			}

			_, err := validator.ValidateCreate(ctx, obj)
			Expect(err).To(HaveOccurred(), "should reject graph edges with invalid member names")
			Expect(err.Error()).To(ContainSubstring("not found in team members"))
		})

		It("Should require graph to have at least one edge when provided for selector strategy", func() {
			By("creating a selector team with empty graph edges")
			obj.Spec.Strategy = validation.StrategySelector
			obj.Spec.Members = []arkv1alpha1.TeamMember{
				{Name: "researcher", Type: "agent"},
			}
			obj.Spec.Selector = &arkv1alpha1.TeamSelectorSpec{
				Agent: "coordinator",
			}
			obj.Spec.Graph = &arkv1alpha1.TeamGraphSpec{
				Edges: []arkv1alpha1.TeamGraphEdge{}, // Empty edges
			}

			_, err := validator.ValidateCreate(ctx, obj)
			Expect(err).To(HaveOccurred(), "should require at least one edge when graph is provided")
			Expect(err.Error()).To(ContainSubstring("at least one edge"))
		})

		It("Should allow selector strategy without graph", func() {
			By("creating a selector team without graph")
			obj.Spec.Strategy = validation.StrategySelector
			obj.Spec.Members = []arkv1alpha1.TeamMember{
				{Name: "researcher", Type: "agent"},
			}
			obj.Spec.Selector = &arkv1alpha1.TeamSelectorSpec{
				Agent: "coordinator",
			}
			// No graph provided - should work fine

			_, err := validator.ValidateCreate(ctx, obj)
			Expect(err).ToNot(HaveOccurred(), "selector strategy without graph should be valid")
		})
	})

	Context("Sequential strategy with loops", func() {
		It("Should accept sequential with loops and maxTurns", func() {
			maxTurns := 5
			obj.Spec.Strategy = validation.StrategySequential
			obj.Spec.Loops = true
			obj.Spec.MaxTurns = &maxTurns
			obj.Spec.Members = []arkv1alpha1.TeamMember{
				{Name: "researcher", Type: "agent"},
			}

			_, err := validator.ValidateCreate(ctx, obj)
			Expect(err).ToNot(HaveOccurred())
		})

		It("Should reject sequential with loops but no maxTurns", func() {
			obj.Spec.Strategy = validation.StrategySequential
			obj.Spec.Loops = true
			obj.Spec.Members = []arkv1alpha1.TeamMember{
				{Name: "researcher", Type: "agent"},
			}

			_, err := validator.ValidateCreate(ctx, obj)
			Expect(err).To(HaveOccurred())
			Expect(err.Error()).To(ContainSubstring("maxTurns is required when loops is enabled"))
		})

		It("Should reject sequential with maxTurns but no loops", func() {
			maxTurns := 5
			obj.Spec.Strategy = validation.StrategySequential
			obj.Spec.MaxTurns = &maxTurns
			obj.Spec.Members = []arkv1alpha1.TeamMember{
				{Name: "researcher", Type: "agent"},
			}

			_, err := validator.ValidateCreate(ctx, obj)
			Expect(err).To(HaveOccurred())
			Expect(err.Error()).To(ContainSubstring("maxTurns can only be set when loops is enabled"))
		})

		It("Should reject loops on selector strategy", func() {
			obj.Spec.Strategy = "selector"
			obj.Spec.Loops = true
			obj.Spec.Members = []arkv1alpha1.TeamMember{
				{Name: "researcher", Type: "agent"},
			}
			obj.Spec.Selector = &arkv1alpha1.TeamSelectorSpec{Agent: "coordinator"}

			_, err := validator.ValidateCreate(ctx, obj)
			Expect(err).To(HaveOccurred())
			Expect(err.Error()).To(ContainSubstring("loops can only be used with the 'sequential' strategy"))
		})
	})

	Context("Round-robin migration via defaulter", func() {
		var defaulter *validation.WebhookDefaulter

		BeforeEach(func() {
			defaulter = &validation.WebhookDefaulter{}
		})

		It("Should migrate round-robin with maxTurns to sequential with loops", func() {
			maxTurns := 5
			team := &arkv1alpha1.Team{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-team",
					Namespace: "default",
				},
				Spec: arkv1alpha1.TeamSpec{
					Strategy: "round-robin",
					MaxTurns: &maxTurns,
					Members: []arkv1alpha1.TeamMember{
						{Name: "researcher", Type: "agent"},
					},
				},
			}

			err := defaulter.Default(ctx, team)
			Expect(err).ToNot(HaveOccurred())
			Expect(team.Spec.Strategy).To(Equal("sequential"))
			Expect(team.Spec.Loops).To(BeTrue())
			Expect(team.Spec.MaxTurns).ToNot(BeNil())
			Expect(*team.Spec.MaxTurns).To(Equal(5))
			Expect(team.Annotations).To(HaveKey(ContainSubstring("migration-warning-round-robin")))
		})

		It("Should migrate round-robin without maxTurns to plain sequential", func() {
			team := &arkv1alpha1.Team{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-team",
					Namespace: "default",
				},
				Spec: arkv1alpha1.TeamSpec{
					Strategy: "round-robin",
					Members: []arkv1alpha1.TeamMember{
						{Name: "researcher", Type: "agent"},
					},
				},
			}

			err := defaulter.Default(ctx, team)
			Expect(err).ToNot(HaveOccurred())
			Expect(team.Spec.Strategy).To(Equal("sequential"))
			Expect(team.Spec.Loops).To(BeFalse())
			Expect(team.Spec.MaxTurns).To(BeNil())
			Expect(team.Annotations).To(HaveKey(ContainSubstring("migration-warning-round-robin")))
		})

		It("Should return migration warning when round-robin is migrated", func() {
			team := &arkv1alpha1.Team{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-team",
					Namespace: "default",
				},
				Spec: arkv1alpha1.TeamSpec{
					Strategy: "round-robin",
					Members: []arkv1alpha1.TeamMember{
						{Name: "researcher", Type: "agent"},
					},
				},
			}

			err := defaulter.Default(ctx, team)
			Expect(err).ToNot(HaveOccurred())

			warnings, err := validator.ValidateCreate(ctx, team)
			Expect(err).ToNot(HaveOccurred())
			Expect(warnings).To(HaveLen(1))
			Expect(warnings[0]).To(ContainSubstring("round-robin"))
			Expect(warnings[0]).To(ContainSubstring("deprecated"))
		})
	})

	Context("Graph strategy validation (should remain strict)", func() {
		It("Should reject graph strategy as unsupported", func() {
			By("creating a team with deprecated graph strategy")
			obj.Spec.Strategy = "graph"
			obj.Spec.Members = []arkv1alpha1.TeamMember{
				{Name: "researcher", Type: "agent"},
				{Name: "analyst", Type: "agent"},
				{Name: "writer", Type: "agent"},
			}
			obj.Spec.Graph = &arkv1alpha1.TeamGraphSpec{
				Edges: []arkv1alpha1.TeamGraphEdge{
					{From: "researcher", To: "analyst"},
					{From: "researcher", To: "writer"},
				},
			}
			maxTurns := 10
			obj.Spec.MaxTurns = &maxTurns

			_, err := validator.ValidateCreate(ctx, obj)
			Expect(err).To(HaveOccurred(), "graph strategy should be rejected as unsupported")
			Expect(err.Error()).To(ContainSubstring("unsupported strategy"))
		})
	})
})
