package v1

import (
	"context"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arka2a "mckinsey.com/ark/internal/a2a"
	"mckinsey.com/ark/internal/annotations"
	"mckinsey.com/ark/internal/validation"
)

var _ = Describe("Agent Webhook", func() {
	var (
		ctx       context.Context
		agent     *arkv1alpha1.Agent
		validator *validation.WebhookValidator
	)

	BeforeEach(func() {
		ctx = context.Background()

		s := runtime.NewScheme()
		Expect(arkv1alpha1.AddToScheme(s)).To(Succeed())

		fakeClient := fake.NewClientBuilder().WithScheme(s).Build()

		validator = &validation.WebhookValidator{
			V: validation.NewValidator(&validation.WebhookLookup{Client: fakeClient}),
		}

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
			warnings, err := validator.ValidateCreate(ctx, agent)
			Expect(err).NotTo(HaveOccurred())
			Expect(warnings).To(BeEmpty())
		})

		It("Should allow A2A agents without model validation", func() {
			agent.Spec.ExecutionEngine = &arkv1alpha1.ExecutionEngineRef{
				Name: arka2a.ExecutionEngineA2A,
			}

			warnings, err := validator.ValidateCreate(ctx, agent)
			Expect(err).NotTo(HaveOccurred())
			Expect(warnings).To(BeEmpty())
		})

		It("Should allow A2A agents to be updated without model validation", func() {
			agent.Spec.ExecutionEngine = &arkv1alpha1.ExecutionEngineRef{
				Name: arka2a.ExecutionEngineA2A,
			}

			oldAgent := agent.DeepCopy()
			agent.Spec.Description = "Updated A2A agent"

			warnings, err := validator.ValidateUpdate(ctx, oldAgent, agent)
			Expect(err).NotTo(HaveOccurred())
			Expect(warnings).To(BeEmpty())
		})

		It("Should allow all agents regardless of execution engine (model validation at runtime)", func() {
			agent.Spec.ExecutionEngine = &arkv1alpha1.ExecutionEngineRef{
				Name: "langchain",
			}

			warnings, err := validator.ValidateCreate(ctx, agent)
			Expect(err).NotTo(HaveOccurred())
			Expect(warnings).To(BeEmpty())
		})
	})

	Context("When defaulting agent model", func() {
		var defaulter *validation.WebhookDefaulter

		BeforeEach(func() {
			defaulter = &validation.WebhookDefaulter{}
		})

		It("Should set default model for regular agents without modelRef", func() {
			agent.Spec.ModelRef = nil
			err := defaulter.Default(ctx, agent)
			Expect(err).NotTo(HaveOccurred())
			Expect(agent.Spec.ModelRef).NotTo(BeNil())
			Expect(agent.Spec.ModelRef.Name).To(Equal("default"))
		})

		It("Should not override existing modelRef", func() {
			agent.Spec.ModelRef = &arkv1alpha1.AgentModelRef{Name: "custom-model"}
			err := defaulter.Default(ctx, agent)
			Expect(err).NotTo(HaveOccurred())
			Expect(agent.Spec.ModelRef.Name).To(Equal("custom-model"))
		})

		It("Should not set default model for A2A agents", func() {
			agent.Spec.ModelRef = nil
			agent.Annotations = map[string]string{
				annotations.A2AServerName: "test-a2a-server",
			}
			err := defaulter.Default(ctx, agent)
			Expect(err).NotTo(HaveOccurred())
			Expect(agent.Spec.ModelRef).To(BeNil())
		})

		It("Should add deprecation warning for 'custom' tool type with agent and tool names", func() {
			agent.Spec.Tools = []arkv1alpha1.AgentTool{
				{Type: "custom", Name: "my-mcp-tool"},
			}
			err := defaulter.Default(ctx, agent)
			Expect(err).NotTo(HaveOccurred())
			Expect(agent.Annotations).To(HaveKey(annotations.MigrationWarningPrefix + "tool-type-custom"))
			Expect(agent.Annotations[annotations.MigrationWarningPrefix+"tool-type-custom"]).To(ContainSubstring("agent 'test-agent'"))
			Expect(agent.Annotations[annotations.MigrationWarningPrefix+"tool-type-custom"]).To(ContainSubstring("tool 'my-mcp-tool'"))
			Expect(agent.Annotations[annotations.MigrationWarningPrefix+"tool-type-custom"]).To(ContainSubstring("deprecated"))
		})

		It("Should not add deprecation warning for explicit tool types", func() {
			agent.Spec.Tools = []arkv1alpha1.AgentTool{
				{Type: "mcp", Name: "my-mcp-tool"},
				{Type: "http", Name: "my-http-tool"},
			}
			err := defaulter.Default(ctx, agent)
			Expect(err).NotTo(HaveOccurred())
			Expect(agent.Annotations).ToNot(HaveKey(annotations.MigrationWarningPrefix + "tool-type-custom"))
		})
	})
})
