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

var _ = Describe("Agent Webhook", func() {
	var (
		ctx       context.Context
		agent     *arkv1alpha1.Agent
		validator *AgentCustomValidator
	)

	BeforeEach(func() {
		ctx = context.Background()

		// Setup scheme
		s := runtime.NewScheme()
		Expect(arkv1alpha1.AddToScheme(s)).To(Succeed())

		// Create fake client
		fakeClient := fake.NewClientBuilder().WithScheme(s).Build()

		// Create validator
		validator = &AgentCustomValidator{
			ResourceValidator: &ResourceValidator{Client: fakeClient},
		}

		// Create base agent
		agent = &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "test-agent",
				Namespace: "default",
			},
			Spec: arkv1alpha1.AgentSpec{
				Description: "Test agent",
				Prompt:      "You are a test agent",
			},
		}
	})

	Context("When validating agent model requirements", func() {
		It("Should allow creation without model validation (handled at runtime)", func() {
			// Agent without modelRef - validation now happens at runtime via status conditions
			warnings, err := validator.ValidateCreate(ctx, agent)
			Expect(err).NotTo(HaveOccurred())
			Expect(warnings).To(BeEmpty())
		})

		It("Should allow A2A agents without model validation", func() {
			// Set execution engine to A2A
			agent.Spec.ExecutionEngine = &arkv1alpha1.ExecutionEngineRef{
				Name: ExecutionEngineA2A,
			}

			warnings, err := validator.ValidateCreate(ctx, agent)
			Expect(err).NotTo(HaveOccurred())
			Expect(warnings).To(BeEmpty())
		})

		It("Should allow A2A agents to be updated without model validation", func() {
			// Set execution engine to A2A
			agent.Spec.ExecutionEngine = &arkv1alpha1.ExecutionEngineRef{
				Name: ExecutionEngineA2A,
			}

			oldAgent := agent.DeepCopy()
			agent.Spec.Description = "Updated A2A agent"

			warnings, err := validator.ValidateUpdate(ctx, oldAgent, agent)
			Expect(err).NotTo(HaveOccurred())
			Expect(warnings).To(BeEmpty())
		})

		It("Should allow all agents regardless of execution engine (model validation at runtime)", func() {
			// Set execution engine to something other than A2A
			agent.Spec.ExecutionEngine = &arkv1alpha1.ExecutionEngineRef{
				Name: "langchain",
			}

			// Model validation now happens at runtime, not in webhook
			warnings, err := validator.ValidateCreate(ctx, agent)
			Expect(err).NotTo(HaveOccurred())
			Expect(warnings).To(BeEmpty())
		})
	})
})
