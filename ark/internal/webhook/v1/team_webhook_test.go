/* Copyright 2025. McKinsey & Company */

package v1

import (
	"context"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

var _ = Describe("Team Webhook", func() {
	var (
		obj       *arkv1alpha1.Team
		oldObj    *arkv1alpha1.Team
		validator *TeamCustomValidator
		ctx       context.Context
	)

	BeforeEach(func() {
		ctx = context.Background()

		// Setup scheme
		s := runtime.NewScheme()
		Expect(arkv1alpha1.AddToScheme(s)).To(Succeed())

		// Create coordinator agent that tests reference
		coordinatorAgent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "coordinator",
				Namespace: "default",
			},
			Spec: arkv1alpha1.AgentSpec{
				Description: "Coordinator agent for selector",
				Prompt:      "You are a coordinator",
			},
		}

		// Create fake client with coordinator agent
		fakeClient := fake.NewClientBuilder().WithScheme(s).WithObjects(coordinatorAgent).Build()

		// Create validator with fake client
		validator = &TeamCustomValidator{
			ResourceValidator: &ResourceValidator{Client: fakeClient},
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
			obj.Spec.Strategy = "selector"
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
			Expect(err).To(BeNil(), "selector strategy with graph should allow multiple edges from same source")
		})

		It("Should reject graph edges with invalid member names for selector strategy", func() {
			By("creating a selector team with graph referencing non-existent members")
			obj.Spec.Strategy = "selector"
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
			Expect(err).NotTo(BeNil(), "should reject graph edges with invalid member names")
			Expect(err.Error()).To(ContainSubstring("not found in team members"))
		})

		It("Should require graph to have at least one edge when provided for selector strategy", func() {
			By("creating a selector team with empty graph edges")
			obj.Spec.Strategy = "selector"
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
			Expect(err).NotTo(BeNil(), "should require at least one edge when graph is provided")
			Expect(err.Error()).To(ContainSubstring("at least one edge"))
		})

		It("Should allow selector strategy without graph (backward compatibility)", func() {
			By("creating a selector team without graph")
			obj.Spec.Strategy = "selector"
			obj.Spec.Members = []arkv1alpha1.TeamMember{
				{Name: "researcher", Type: "agent"},
			}
			obj.Spec.Selector = &arkv1alpha1.TeamSelectorSpec{
				Agent: "coordinator",
			}
			// No graph provided - should work fine

			_, err := validator.ValidateCreate(ctx, obj)
			Expect(err).To(BeNil(), "selector strategy without graph should be valid")
		})
	})

	Context("Graph strategy validation (should remain strict)", func() {
		It("Should reject multiple edges from same source for graph strategy", func() {
			By("creating a graph team with multiple edges from same source")
			obj.Spec.Strategy = "graph"
			obj.Spec.Members = []arkv1alpha1.TeamMember{
				{Name: "researcher", Type: "agent"},
				{Name: "analyst", Type: "agent"},
				{Name: "writer", Type: "agent"},
			}
			obj.Spec.Graph = &arkv1alpha1.TeamGraphSpec{
				Edges: []arkv1alpha1.TeamGraphEdge{
					{From: "researcher", To: "analyst"},
					{From: "researcher", To: "writer"}, // Multiple edges from same source - NOT allowed for graph
				},
			}
			maxTurns := 10
			obj.Spec.MaxTurns = &maxTurns

			_, err := validator.ValidateCreate(ctx, obj)
			Expect(err).NotTo(BeNil(), "graph strategy should reject multiple edges from same source")
			Expect(err.Error()).To(ContainSubstring("more than one outgoing edge"))
		})
	})
})
