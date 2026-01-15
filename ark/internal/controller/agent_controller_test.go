/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	eventnoop "mckinsey.com/ark/internal/eventing/noop"
)

var _ = Describe("Agent Controller", func() {
	Context("When reconciling a resource", func() {
		const resourceName = "test-resource"
		const testModelName = "test-model"
		const weatherAPIToolName = "weather-api"

		ctx := context.Background()

		typeNamespacedName := types.NamespacedName{
			Name:      resourceName,
			Namespace: "default", // TODO(user):Modify as needed
		}
		agent := &arkv1alpha1.Agent{}

		BeforeEach(func() {
			By("creating the custom resource for the Kind Agent")
			err := k8sClient.Get(ctx, typeNamespacedName, agent)
			if err != nil && errors.IsNotFound(err) {
				resource := &arkv1alpha1.Agent{
					ObjectMeta: metav1.ObjectMeta{
						Name:      resourceName,
						Namespace: "default",
					},
					Spec: arkv1alpha1.AgentSpec{
						ModelRef: &arkv1alpha1.AgentModelRef{
							Name: testModelName,
						},
						Prompt: "test prompt",
					},
				}
				Expect(k8sClient.Create(ctx, resource)).To(Succeed())
			}
		})

		AfterEach(func() {
			// TODO(user): Cleanup logic after each test, like removing the resource instance.
			resource := &arkv1alpha1.Agent{}
			err := k8sClient.Get(ctx, typeNamespacedName, resource)
			Expect(err).NotTo(HaveOccurred())

			By("Cleanup the specific resource instance Agent")
			Expect(k8sClient.Delete(ctx, resource)).To(Succeed())
		})
		It("should successfully reconcile the resource", func() {
			By("Reconciling the created resource")
			controllerReconciler := &AgentReconciler{
				Client:   k8sClient,
				Scheme:   k8sClient.Scheme(),
				Eventing: eventnoop.NewProvider(),
			}

			_, err := controllerReconciler.Reconcile(ctx, reconcile.Request{
				NamespacedName: typeNamespacedName,
			})
			Expect(err).NotTo(HaveOccurred())
			// TODO(user): Add more specific assertions depending on your controller's reconciliation logic.
			// Example: If you expect a certain status condition after reconciliation, verify it here.
		})

		It("should handle agents without explicit model reference", func() {
			const defaultModelResourceName = "test-default-model-resource"
			defaultModelTypeNamespacedName := types.NamespacedName{
				Name:      defaultModelResourceName,
				Namespace: "default",
			}

			By("creating an agent without explicit model reference")
			defaultModelAgent := &arkv1alpha1.Agent{
				ObjectMeta: metav1.ObjectMeta{
					Name:      defaultModelResourceName,
					Namespace: "default",
				},
				Spec: arkv1alpha1.AgentSpec{
					ModelRef: &arkv1alpha1.AgentModelRef{Name: testModelName}, // Webhook sets default model
					Prompt:   "test prompt for default model",
				},
			}
			Expect(k8sClient.Create(ctx, defaultModelAgent)).To(Succeed())

			By("Reconciling the agent with no explicit model")
			controllerReconciler := &AgentReconciler{
				Client:   k8sClient,
				Scheme:   k8sClient.Scheme(),
				Eventing: eventnoop.NewProvider(),
			}

			_, err := controllerReconciler.Reconcile(ctx, reconcile.Request{
				NamespacedName: defaultModelTypeNamespacedName,
			})
			Expect(err).NotTo(HaveOccurred())

			By("Cleanup the default model test resource")
			Expect(k8sClient.Delete(ctx, defaultModelAgent)).To(Succeed())
		})

		It("should handle A2A agents without model reference", func() {
			const a2aAgentResourceName = "test-a2a-agent-resource"
			a2aAgentTypeNamespacedName := types.NamespacedName{
				Name:      a2aAgentResourceName,
				Namespace: "default",
			}

			By("creating an A2A agent without model reference")
			a2aAgent := &arkv1alpha1.Agent{
				ObjectMeta: metav1.ObjectMeta{
					Name:      a2aAgentResourceName,
					Namespace: "default",
					Annotations: map[string]string{
						"ark.mckinsey.com/a2a-server-name": "test-a2a-server",
					},
				},
				Spec: arkv1alpha1.AgentSpec{
					ModelRef: nil,
					Prompt:   "test prompt for A2A agent",
				},
			}
			Expect(k8sClient.Create(ctx, a2aAgent)).To(Succeed())

			By("Reconciling the A2A agent without model")
			controllerReconciler := &AgentReconciler{
				Client:   k8sClient,
				Scheme:   k8sClient.Scheme(),
				Eventing: eventnoop.NewProvider(),
			}

			_, err := controllerReconciler.Reconcile(ctx, reconcile.Request{
				NamespacedName: a2aAgentTypeNamespacedName,
			})
			Expect(err).NotTo(HaveOccurred())

			By("Cleanup the A2A agent test resource")
			Expect(k8sClient.Delete(ctx, a2aAgent)).To(Succeed())
		})

		It("should handle agents with partial tool dependencies", func() {
			const partialToolAgentName = "test-partial-tool-agent"
			partialToolAgentTypeNamespacedName := types.NamespacedName{
				Name:      partialToolAgentName,
				Namespace: "default",
			}

			By("creating a Tool CRD that will be referenced by partial")
			baseTool := &arkv1alpha1.Tool{
				ObjectMeta: metav1.ObjectMeta{
					Name:      weatherAPIToolName,
					Namespace: "default",
				},
				Spec: arkv1alpha1.ToolSpec{
					Type:        "http",
					Description: "Weather API tool",
				},
			}
			Expect(k8sClient.Create(ctx, baseTool)).To(Succeed())
			defer func() {
				Expect(k8sClient.Delete(ctx, baseTool)).To(Succeed())
			}()

			By("creating an agent with partial tool configuration")
			partialToolAgent := &arkv1alpha1.Agent{
				ObjectMeta: metav1.ObjectMeta{
					Name:      partialToolAgentName,
					Namespace: "default",
				},
				Spec: arkv1alpha1.AgentSpec{
					ModelRef: &arkv1alpha1.AgentModelRef{Name: testModelName},
					Prompt:   "test prompt for partial tool agent",
					Tools: []arkv1alpha1.AgentTool{
						{
							Type:        "custom",
							Name:        "get-weather", // Exposed name
							Description: "Get weather for a specific city",
							Partial: &arkv1alpha1.ToolPartial{
								Name: weatherAPIToolName, // Actual Tool CRD name
								Parameters: []arkv1alpha1.ToolFunction{
									{
										Name:  "units",
										Value: "celsius", // Pre-filled parameter
									},
								},
							},
						},
					},
				},
			}
			Expect(k8sClient.Create(ctx, partialToolAgent)).To(Succeed())
			defer func() {
				Expect(k8sClient.Delete(ctx, partialToolAgent)).To(Succeed())
			}()

			By("Reconciling the agent with partial tool dependencies")
			controllerReconciler := &AgentReconciler{
				Client:   k8sClient,
				Scheme:   k8sClient.Scheme(),
				Eventing: eventnoop.NewProvider(),
			}

			_, err := controllerReconciler.Reconcile(ctx, reconcile.Request{
				NamespacedName: partialToolAgentTypeNamespacedName,
			})
			Expect(err).NotTo(HaveOccurred())

			By("Verifying agentDependsOnTool works with partial tools")
			// Test that agent depends on the exposed name
			Expect(controllerReconciler.agentDependsOnTool(partialToolAgent, "get-weather")).To(BeTrue())
			// Test that agent depends on the actual CRD name
			Expect(controllerReconciler.agentDependsOnTool(partialToolAgent, weatherAPIToolName)).To(BeTrue())
			// Test that agent does not depend on unrelated tool
			Expect(controllerReconciler.agentDependsOnTool(partialToolAgent, "unrelated-tool")).To(BeFalse())
		})

		It("should fail reconciliation when partial tool CRD is missing", func() {
			const missingToolAgentName = "test-missing-tool-agent"
			missingToolAgentTypeNamespacedName := types.NamespacedName{
				Name:      missingToolAgentName,
				Namespace: "default",
			}

			By("creating an agent with partial tool referencing non-existent CRD")
			missingToolAgent := &arkv1alpha1.Agent{
				ObjectMeta: metav1.ObjectMeta{
					Name:      missingToolAgentName,
					Namespace: "default",
				},
				Spec: arkv1alpha1.AgentSpec{
					Prompt: "test prompt for missing tool agent",
					Tools: []arkv1alpha1.AgentTool{
						{
							Type: "custom",
							Name: "missing-tool", // Exposed name
							Partial: &arkv1alpha1.ToolPartial{
								Name: "non-existent-tool", // This CRD doesn't exist
							},
						},
					},
				},
			}
			Expect(k8sClient.Create(ctx, missingToolAgent)).To(Succeed())
			defer func() {
				Expect(k8sClient.Delete(ctx, missingToolAgent)).To(Succeed())
			}()

			By("Reconciling the agent with missing tool dependency")
			controllerReconciler := &AgentReconciler{
				Client:   k8sClient,
				Scheme:   k8sClient.Scheme(),
				Eventing: eventnoop.NewProvider(),
			}

			// First reconcile to initialize status
			_, err := controllerReconciler.Reconcile(ctx, reconcile.Request{
				NamespacedName: missingToolAgentTypeNamespacedName,
			})
			Expect(err).NotTo(HaveOccurred())

			// Second reconcile to check dependencies
			_, err = controllerReconciler.Reconcile(ctx, reconcile.Request{
				NamespacedName: missingToolAgentTypeNamespacedName,
			})
			Expect(err).NotTo(HaveOccurred()) // Reconcile should succeed but set status to unavailable

			By("Verifying agent status shows tool not found")
			var reconciledAgent arkv1alpha1.Agent
			Expect(k8sClient.Get(ctx, missingToolAgentTypeNamespacedName, &reconciledAgent)).To(Succeed())
			Expect(reconciledAgent.Status.Conditions).To(HaveLen(1))
			condition := reconciledAgent.Status.Conditions[0]
			Expect(condition.Type).To(Equal("Available"))
			Expect(condition.Status).To(Equal(metav1.ConditionFalse))
			Expect(condition.Reason).To(Equal("ToolNotFound"))
			Expect(condition.Message).To(ContainSubstring("Tool 'non-existent-tool' not found"))
		})
	})
})
