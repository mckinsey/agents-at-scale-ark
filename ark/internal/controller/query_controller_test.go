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

var _ = Describe("buildFallbackRaw", func() {
	It("should produce valid JSON with assistant role", func() {
		raw := buildFallbackRaw("hello world")
		Expect(raw).To(ContainSubstring(`"role":"assistant"`))
		Expect(raw).To(ContainSubstring(`"content":"hello world"`))

		var parsed []map[string]string
		Expect(json.Unmarshal([]byte(raw), &parsed)).To(Succeed())
		Expect(parsed).To(HaveLen(1))
		Expect(parsed[0]["role"]).To(Equal("assistant"))
		Expect(parsed[0]["content"]).To(Equal("hello world"))
	})

	It("should handle empty content", func() {
		raw := buildFallbackRaw("")
		var parsed []map[string]string
		Expect(json.Unmarshal([]byte(raw), &parsed)).To(Succeed())
		Expect(parsed[0]["content"]).To(Equal(""))
	})
})

var _ = Describe("extractEngineResponseMeta", func() {
	Context("protocol-first extraction precedence", func() {
		It("should pass through legacy messages and track protocol presence", func() {
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
			responseMsg.Metadata = map[string]any{
				arka2a.ExecutionContextExtensionURI: map[string]any{
					"conversationId":     "conv-123",
					"responseMessagesV1": json.RawMessage(protoBytes),
					"messages":           json.RawMessage(`[{"role":"assistant","content":"legacy msg"}]`),
				},
			}

			result := &protocol.MessageResult{Result: &responseMsg}
			meta := extractEngineResponseMeta(result)

			Expect(meta.ConversationId).To(Equal("conv-123"))
			Expect(meta.MessagesRaw).To(ContainSubstring("legacy msg"))
			Expect(meta.ProtocolNative).To(BeTrue())
		})

		It("should merge a2a metadata from legacy key and pass through legacy messages", func() {
			protoMsgs := []protocol.Message{
				protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
					protocol.NewTextPart("answer"),
				}),
			}
			protoBytes, err := json.Marshal(protoMsgs)
			Expect(err).NotTo(HaveOccurred())

			responseMsg := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
				protocol.NewTextPart("hello"),
			})
			responseMsg.Metadata = map[string]any{
				arka2a.QueryExtensionMetadataKey: map[string]any{
					"conversationId": "conv-legacy",
					"a2a": map[string]any{
						"contextId": "ctx-abc",
						"taskId":    "task-xyz",
					},
					"messages": json.RawMessage(`[{"role":"assistant","content":"legacy"}]`),
				},
				arka2a.ExecutionContextExtensionURI: map[string]any{
					"conversationId":     "conv-ext",
					"responseMessagesV1": json.RawMessage(protoBytes),
				},
			}

			result := &protocol.MessageResult{Result: &responseMsg}
			meta := extractEngineResponseMeta(result)

			Expect(meta.ConversationId).To(Equal("conv-ext"))
			Expect(meta.A2AContextID).To(Equal("ctx-abc"))
			Expect(meta.A2ATaskID).To(Equal("task-xyz"))
			Expect(meta.MessagesRaw).To(ContainSubstring("legacy"))
			Expect(meta.ProtocolNative).To(BeTrue())
		})

		It("should fall back to legacy messages when responseMessagesV1 is absent", func() {
			responseMsg := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
				protocol.NewTextPart("hello"),
			})
			responseMsg.Metadata = map[string]any{
				arka2a.QueryExtensionMetadataKey: map[string]any{
					"conversationId": "conv-456",
					"messages":       json.RawMessage(`[{"role":"assistant","content":"legacy msg"}]`),
				},
			}

			result := &protocol.MessageResult{Result: &responseMsg}
			meta := extractEngineResponseMeta(result)

			Expect(meta.ConversationId).To(Equal("conv-456"))
			Expect(meta.MessagesRaw).To(ContainSubstring("legacy msg"))
			Expect(meta.ProtocolNative).To(BeFalse())
		})

		It("should handle nil result gracefully", func() {
			meta := extractEngineResponseMeta(nil)
			Expect(meta.MessagesRaw).To(BeEmpty())
		})
	})
})
