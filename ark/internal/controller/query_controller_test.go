/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"encoding/json"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"github.com/openai/openai-go"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/types"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	completions "mckinsey.com/ark/executors/completions"
	arka2a "mckinsey.com/ark/internal/a2a"
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
		It("should serialize all message types correctly", func() {
			messages := []completions.Message{
				completions.Message(openai.AssistantMessage("hello")),
				completions.Message(openai.UserMessage("hi")),
				completions.Message(openai.SystemMessage("sys")),
				completions.Message(openai.ToolMessage("tool-content", "tool-1")),
			}

			jsonStr, err := serializeMessages(messages)
			Expect(err).NotTo(HaveOccurred())
			Expect(jsonStr).To(ContainSubstring("assistant"))
			Expect(jsonStr).To(ContainSubstring("user"))
			Expect(jsonStr).To(ContainSubstring("system"))
			Expect(jsonStr).To(ContainSubstring("tool"))
		})

		It("should return error for unknown message types", func() {
			messages := []completions.Message{{}}
			_, err := serializeMessages(messages)
			Expect(err).To(HaveOccurred())
			Expect(err.Error()).To(Equal("unknown message type encountered during serialization"))
		})
	})
})

var _ = Describe("extractEngineResponseMeta", func() {
	Context("three-tier extraction precedence", func() {
		It("should prefer legacy messages for response.raw when both fields are present", func() {
			protoMsgs := []protocol.Message{
				protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
					protocol.NewTextPart("protocol answer"),
				}),
			}
			protoBytes, err := json.Marshal(protoMsgs)
			Expect(err).NotTo(HaveOccurred())

			responseMsg := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
				protocol.NewTextPart("hello"),
			})
			responseMsg.Extensions = []string{arka2a.ExecutionContextExtensionURI}
			responseMsg.Metadata = map[string]any{
				arka2a.ExecutionContextExtensionURI: map[string]any{
					"conversationId":     "conv-123",
					"responseMessagesV1": json.RawMessage(protoBytes),
					"messages":           json.RawMessage(`[{"role":"system","content":"legacy with role info"}]`),
				},
			}

			msgResult := &protocol.MessageResult{Result: &responseMsg}
			meta := extractEngineResponseMeta(msgResult)

			Expect(meta.ConversationId).To(Equal("conv-123"))
			Expect(meta.ProtocolNative).To(BeFalse())
			Expect(meta.MessagesRaw).To(ContainSubstring("legacy with role info"))
		})

		It("should fall back to responseMessagesV1 when legacy messages is absent", func() {
			protoMsgs := []protocol.Message{
				protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
					protocol.NewTextPart("protocol only"),
				}),
			}
			protoBytes, err := json.Marshal(protoMsgs)
			Expect(err).NotTo(HaveOccurred())

			responseMsg := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
				protocol.NewTextPart("hello"),
			})
			responseMsg.Extensions = []string{arka2a.ExecutionContextExtensionURI}
			responseMsg.Metadata = map[string]any{
				arka2a.ExecutionContextExtensionURI: map[string]any{
					"conversationId":     "conv-proto",
					"responseMessagesV1": json.RawMessage(protoBytes),
				},
			}

			msgResult := &protocol.MessageResult{Result: &responseMsg}
			meta := extractEngineResponseMeta(msgResult)

			Expect(meta.ConversationId).To(Equal("conv-proto"))
			Expect(meta.ProtocolNative).To(BeTrue())
			Expect(meta.MessagesRaw).To(ContainSubstring("protocol only"))
		})

		It("should fall back to legacy messages when responseMessagesV1 is absent", func() {
			responseMsg := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
				protocol.NewTextPart("hello"),
			})
			responseMsg.Metadata = map[string]any{
				arka2a.ArkMetadataKey: map[string]any{
					"conversationId": "conv-456",
					"messages":       json.RawMessage(`[{"role":"assistant","content":"legacy msg"}]`),
				},
			}

			msgResult := &protocol.MessageResult{Result: &responseMsg}
			meta := extractEngineResponseMeta(msgResult)

			Expect(meta.ConversationId).To(Equal("conv-456"))
			Expect(meta.ProtocolNative).To(BeFalse())
			Expect(meta.MessagesRaw).To(ContainSubstring("legacy msg"))
		})

		It("should return empty MessagesRaw when neither field is present", func() {
			responseMsg := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
				protocol.NewTextPart("just text"),
			})
			responseMsg.Metadata = map[string]any{
				arka2a.ExecutionContextExtensionURI: map[string]any{
					"conversationId": "conv-789",
				},
			}

			msgResult := &protocol.MessageResult{Result: &responseMsg}
			meta := extractEngineResponseMeta(msgResult)

			Expect(meta.ConversationId).To(Equal("conv-789"))
			Expect(meta.MessagesRaw).To(BeEmpty())
			Expect(meta.ProtocolNative).To(BeFalse())
		})

		It("should extract token usage from extension URI metadata", func() {
			responseMsg := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
				protocol.NewTextPart("hello"),
			})
			responseMsg.Metadata = map[string]any{
				arka2a.ExecutionContextExtensionURI: map[string]any{
					"tokenUsage": map[string]any{
						"prompt_tokens":     float64(100),
						"completion_tokens": float64(50),
						"total_tokens":      float64(150),
					},
				},
			}

			msgResult := &protocol.MessageResult{Result: &responseMsg}
			meta := extractEngineResponseMeta(msgResult)

			Expect(meta.TokenUsage).NotTo(BeNil())
			Expect(meta.TokenUsage.PromptTokens).To(Equal(int64(100)))
			Expect(meta.TokenUsage.CompletionTokens).To(Equal(int64(50)))
			Expect(meta.TokenUsage.TotalTokens).To(Equal(int64(150)))
		})

		It("should return empty meta for nil result", func() {
			meta := extractEngineResponseMeta(nil)
			Expect(meta.MessagesRaw).To(BeEmpty())
			Expect(meta.ConversationId).To(BeEmpty())
			Expect(meta.TokenUsage).To(BeNil())
		})
	})
})

var _ = Describe("protocolMessagesToRawJSON", func() {
	It("should convert protocol messages to role/content JSON", func() {
		protoMsgs := []protocol.Message{
			protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
				protocol.NewTextPart("agent response"),
			}),
			protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
				protocol.NewTextPart("user input"),
			}),
		}
		data, err := json.Marshal(protoMsgs)
		Expect(err).NotTo(HaveOccurred())

		rawJSON := protocolMessagesToRawJSON(data)
		Expect(rawJSON).To(ContainSubstring(`"role":"assistant"`))
		Expect(rawJSON).To(ContainSubstring(`"content":"agent response"`))
		Expect(rawJSON).To(ContainSubstring(`"role":"user"`))
		Expect(rawJSON).To(ContainSubstring(`"content":"user input"`))
	})

	It("should return empty string for empty data", func() {
		Expect(protocolMessagesToRawJSON(nil)).To(BeEmpty())
		Expect(protocolMessagesToRawJSON([]byte{})).To(BeEmpty())
	})

	It("should return empty string for invalid JSON", func() {
		Expect(protocolMessagesToRawJSON([]byte("not json"))).To(BeEmpty())
	})
})
