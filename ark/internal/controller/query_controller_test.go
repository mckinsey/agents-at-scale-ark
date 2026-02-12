/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"encoding/json"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/types"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/genai"
)

var _ = Describe("Query Controller", func() {
	Context("When reconciling a resource", func() {
		const resourceName = "test-resource"

		ctx := context.Background()

		typeNamespacedName := types.NamespacedName{
			Name:      resourceName,
			Namespace: "default", // TODO(user):Modify as needed
		}
		query := &arkv1alpha1.Query{}

		BeforeEach(func() {
			By("creating the custom resource for the Kind Query")
			err := k8sClient.Get(ctx, typeNamespacedName, query)
			if err != nil && errors.IsNotFound(err) {
				resource := &arkv1alpha1.Query{
					ObjectMeta: metav1.ObjectMeta{
						Name:      resourceName,
						Namespace: "default",
					},
					Spec: arkv1alpha1.QuerySpec{
						Target: &arkv1alpha1.QueryTarget{
							Type: "agent",
							Name: "test-agent",
						},
					},
				}

				// Set input using RawExtension helper
				err := resource.Spec.SetInputString("test input question")
				Expect(err).ShouldNot(HaveOccurred())

				Expect(k8sClient.Create(ctx, resource)).To(Succeed())
			}
		})

		AfterEach(func() {
			// TODO(user): Cleanup logic after each test, like removing the resource instance.
			resource := &arkv1alpha1.Query{}
			err := k8sClient.Get(ctx, typeNamespacedName, resource)
			Expect(err).NotTo(HaveOccurred())

			By("Cleanup the specific resource instance Query")
			Expect(k8sClient.Delete(ctx, resource)).To(Succeed())
		})
		It("should successfully reconcile the resource", func() {
			By("Reconciling the created resource")
			controllerReconciler := &QueryReconciler{
				Client: k8sClient,
				Scheme: k8sClient.Scheme(),
			}

			_, err := controllerReconciler.Reconcile(ctx, reconcile.Request{
				NamespacedName: typeNamespacedName,
			})
			Expect(err).NotTo(HaveOccurred())
			// TODO(user): Add more specific assertions depending on your controller's reconciliation logic.
			// Example: If you expect a certain status condition after reconciliation, verify it here.
		})
	})
	Context("When setting status.conditions", func() {
		It("Should initialize conditions when query is created", func() {
			ctx := context.Background()

			// Create query
			query := &arkv1alpha1.Query{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-query-conditions",
					Namespace: "default",
				},
				Spec: arkv1alpha1.QuerySpec{
					Target: &arkv1alpha1.QueryTarget{
						Type: "agent",
						Name: "test-agent",
					},
				},
			}

			// Set input using RawExtension helper
			err := query.Spec.SetInputString("test input question")
			Expect(err).ShouldNot(HaveOccurred())

			Expect(k8sClient.Create(ctx, query)).Should(Succeed())

			queryLookupKey := types.NamespacedName{Name: "test-query-conditions", Namespace: "default"}

			controllerReconciler := &QueryReconciler{
				Client: k8sClient,
				Scheme: k8sClient.Scheme(),
			}

			// First reconcile
			_, err = controllerReconciler.Reconcile(ctx, ctrl.Request{
				NamespacedName: queryLookupKey,
			})
			Expect(err).NotTo(HaveOccurred())

			// Second reconcile should set status.conditions to QueryNotStarted
			_, err = controllerReconciler.Reconcile(ctx, ctrl.Request{
				NamespacedName: queryLookupKey,
			})
			Expect(err).NotTo(HaveOccurred())

			// Verify conditions were initialized
			createdQuery := &arkv1alpha1.Query{}
			Expect(k8sClient.Get(ctx, queryLookupKey, createdQuery)).Should(Succeed())

			Expect(createdQuery.Status.Conditions).To(HaveLen(1))
			condition := createdQuery.Status.Conditions[0]
			Expect(condition.Type).To(Equal(string(arkv1alpha1.QueryCompleted)))
			Expect(condition.Status).To(Equal(metav1.ConditionFalse))
			Expect(condition.Reason).To(Equal("QueryNotStarted"))
			Expect(condition.Message).To(Equal("The query has not been started yet"))
			Expect(condition.ObservedGeneration).To(Equal(createdQuery.Generation))

			// Cleanup
			Expect(k8sClient.Delete(ctx, createdQuery)).Should(Succeed())
		})

		It("Should update conditions when query status changes", func() {
			ctx := context.Background()

			// Create query
			query := &arkv1alpha1.Query{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-query-conditions-2",
					Namespace: "default",
				},
				Spec: arkv1alpha1.QuerySpec{
					Target: &arkv1alpha1.QueryTarget{
						Type: "agent",
						Name: "test-agent",
					},
				},
			}

			// Set input using RawExtension helper
			err := query.Spec.SetInputString("test input question")
			Expect(err).ShouldNot(HaveOccurred())

			Expect(k8sClient.Create(ctx, query)).Should(Succeed())

			queryLookupKey := types.NamespacedName{Name: "test-query-conditions-2", Namespace: "default"}

			controllerReconciler := &QueryReconciler{
				Client: k8sClient,
				Scheme: k8sClient.Scheme(),
			}

			// First reconcile
			_, err = controllerReconciler.Reconcile(ctx, ctrl.Request{
				NamespacedName: queryLookupKey,
			})
			Expect(err).NotTo(HaveOccurred())

			// Second reconcile should set status.conditions to QueryNotStarted
			_, err = controllerReconciler.Reconcile(ctx, ctrl.Request{
				NamespacedName: queryLookupKey,
			})
			Expect(err).NotTo(HaveOccurred())

			// Third reconcile should set status.conditions to QueryRunning
			_, err = controllerReconciler.Reconcile(ctx, ctrl.Request{
				NamespacedName: queryLookupKey,
			})
			Expect(err).NotTo(HaveOccurred())

			// Verify conditions were initialized
			createdQuery := &arkv1alpha1.Query{}
			Expect(k8sClient.Get(ctx, queryLookupKey, createdQuery)).Should(Succeed())

			// Verify conditions were updated for running state
			Expect(k8sClient.Get(ctx, queryLookupKey, createdQuery)).Should(Succeed())

			Expect(createdQuery.Status.Conditions).To(HaveLen(1))
			condition := createdQuery.Status.Conditions[0]
			Expect(condition.Type).To(Equal(string(arkv1alpha1.QueryCompleted)))
			Expect(condition.Status).To(Equal(metav1.ConditionFalse))
			Expect(condition.Reason).To(Equal("QueryRunning"))
			Expect(condition.Message).To(Equal("Query is running"))
			Expect(condition.ObservedGeneration).To(Equal(createdQuery.Generation))

			// Cleanup
			Expect(k8sClient.Delete(ctx, createdQuery)).Should(Succeed())
		})
	})
})

var _ = Describe("Query Controller Message Serialization", func() {
	Context("When serializing messages", func() {
		It("should serialize all message types in OpenAI-compatible format", func() {
			messages := []genai.Message{
				genai.NewAssistantMessage("hello"),
				genai.NewUserMessage("hi"),
				genai.NewSystemMessage("sys"),
				genai.ToolMessage("tool-content", "tool-1"),
			}

			jsonStr, err := serializeMessages(messages, nil, genai.A2APayloadModeCompat)
			Expect(err).NotTo(HaveOccurred())

			var decoded []map[string]interface{}
			Expect(json.Unmarshal([]byte(jsonStr), &decoded)).To(Succeed())
			Expect(decoded).To(HaveLen(4))
			Expect(decoded[0]).To(HaveKeyWithValue("role", "assistant"))
			Expect(decoded[1]).To(HaveKeyWithValue("role", "user"))
			Expect(decoded[2]).To(HaveKeyWithValue("role", "system"))
			Expect(decoded[3]).To(HaveKeyWithValue("role", "tool"))
		})

		It("should handle empty messages gracefully", func() {
			messages := []genai.Message{{}}
			jsonStr, err := serializeMessages(messages, nil, genai.A2APayloadModeCompat)
			Expect(err).NotTo(HaveOccurred())
			Expect(jsonStr).NotTo(BeEmpty())
		})

		It("should serialize messages in A2A format when native payload mode is requested", func() {
			messages := []genai.Message{
				genai.NewAssistantMessage("hello"),
				genai.NewUserMessage("hi"),
			}

			jsonStr, err := serializeMessages(messages, nil, genai.A2APayloadModeNative)
			Expect(err).NotTo(HaveOccurred())

			var decoded []protocol.Message
			Expect(json.Unmarshal([]byte(jsonStr), &decoded)).To(Succeed())
			Expect(decoded).To(HaveLen(2))
			Expect(string(decoded[0].Role)).To(Equal("agent"))
			Expect(string(decoded[1].Role)).To(Equal("user"))
		})

		It("should serialize provided A2A messages directly in native mode", func() {
			a2aMessages := []protocol.Message{
				protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
					protocol.NewDataPart(map[string]any{
						"structured": "payload",
					}),
				}),
			}

			jsonStr, err := serializeMessages(nil, a2aMessages, genai.A2APayloadModeNative)
			Expect(err).NotTo(HaveOccurred())

			var decoded []protocol.Message
			Expect(json.Unmarshal([]byte(jsonStr), &decoded)).To(Succeed())
			Expect(decoded).To(HaveLen(1))
			Expect(decoded[0].Role).To(Equal(protocol.MessageRoleUser))
			Expect(genai.ExtractA2ATextFromMessage(decoded[0])).To(ContainSubstring(`"structured":"payload"`))
		})

		It("should default to OpenAI format when payload mode is explicitly compat", func() {
			messages := []genai.Message{
				genai.NewUserMessage("test"),
			}

			jsonStr, err := serializeMessages(messages, nil, genai.A2APayloadModeCompat)
			Expect(err).NotTo(HaveOccurred())

			var decoded []map[string]interface{}
			Expect(json.Unmarshal([]byte(jsonStr), &decoded)).To(Succeed())
			Expect(decoded).To(HaveLen(1))
			Expect(decoded[0]).To(HaveKeyWithValue("role", "user"))
			Expect(decoded[0]).NotTo(HaveKey("parts"))
		})
	})
})

var _ = Describe("Query Controller Delegated A2A Aggregation", func() {
	It("should collect delegated A2A payloads from tool messages", func() {
		envelope := map[string]interface{}{
			"contextId": "ctx-1",
			"taskId":    "task-1",
			"artifacts": []map[string]interface{}{
				{
					"artifactId": "artifact-1",
				},
			},
		}
		rawEnvelope, err := json.Marshal(envelope)
		Expect(err).NotTo(HaveOccurred())

		messages := []genai.Message{
			genai.NewUserMessage("hello"),
			genai.ToolMessage(string(rawEnvelope), "tool-call-1"),
			genai.NewAssistantMessage("done"),
		}

		contextID, taskIDs, artifacts := collectDelegatedA2AFromMessages(messages)
		Expect(contextID).To(Equal("ctx-1"))
		Expect(taskIDs).To(Equal([]string{"task-1"}))
		Expect(artifacts).To(HaveLen(1))
		Expect(artifacts[0]).To(HaveKeyWithValue("artifactId", "artifact-1"))
	})

	It("should hydrate delegated A2A data only for native experimental mode", func() {
		envelope := map[string]interface{}{
			"contextId": "ctx-2",
			"taskId":    "task-2",
		}
		rawEnvelope, err := json.Marshal(envelope)
		Expect(err).NotTo(HaveOccurred())

		result := &genai.ExecutionResult{
			Messages:       []genai.Message{genai.ToolMessage(string(rawEnvelope), "tool-call-2")},
			A2APayloadMode: genai.A2APayloadModeNative,
		}
		expCtx := genai.WithA2AExperimentalEnabled(context.Background(), true)
		hydrateDelegatedA2AData(expCtx, result)
		Expect(result.DelegatedA2AContextID).To(Equal("ctx-2"))
		Expect(result.DelegatedA2ATaskIDs).To(Equal([]string{"task-2"}))

		compatResult := &genai.ExecutionResult{
			Messages:       []genai.Message{genai.ToolMessage(string(rawEnvelope), "tool-call-2")},
			A2APayloadMode: genai.A2APayloadModeCompat,
		}
		hydrateDelegatedA2AData(expCtx, compatResult)
		Expect(compatResult.DelegatedA2AContextID).To(BeEmpty())
		Expect(compatResult.DelegatedA2ATaskIDs).To(BeEmpty())

		nonExpResult := &genai.ExecutionResult{
			Messages:       []genai.Message{genai.ToolMessage(string(rawEnvelope), "tool-call-2")},
			A2APayloadMode: genai.A2APayloadModeNative,
		}
		hydrateDelegatedA2AData(context.Background(), nonExpResult)
		Expect(nonExpResult.DelegatedA2AContextID).To(BeEmpty())
		Expect(nonExpResult.DelegatedA2ATaskIDs).To(BeEmpty())
	})

	It("should fallback response A2A metadata from delegated aggregation", func() {
		response := &arkv1alpha1.Response{}
		executionResult := &genai.ExecutionResult{
			DelegatedA2AContextID: "ctx-fallback",
			DelegatedA2ATaskIDs:   []string{"task-old", "task-latest"},
		}

		applyA2AMetadataFromExecutionResult(response, executionResult)
		Expect(response.A2A).NotTo(BeNil())
		Expect(response.A2A.ContextID).To(Equal("ctx-fallback"))
		Expect(response.A2A.TaskID).To(Equal("task-latest"))
	})
})
