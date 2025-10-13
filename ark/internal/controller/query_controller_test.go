/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"github.com/openai/openai-go"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

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
						Targets: []arkv1alpha1.QueryTarget{
							{
								Type: "agent",
								Name: "test-agent",
							},
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
})

var _ = Describe("Query Controller Message Serialization", func() {
	Context("When serializing messages", func() {
		It("should serialize all message types correctly", func() {
			messages := []genai.Message{
				genai.Message(openai.AssistantMessage("hello")),
				genai.Message(openai.UserMessage("hi")),
				genai.Message(openai.SystemMessage("sys")),
				genai.Message(openai.ToolMessage("tool-content", "tool-1")),
			}

			jsonStr, err := serializeMessages(messages)
			Expect(err).NotTo(HaveOccurred())
			Expect(jsonStr).To(ContainSubstring("assistant"))
			Expect(jsonStr).To(ContainSubstring("user"))
			Expect(jsonStr).To(ContainSubstring("system"))
			Expect(jsonStr).To(ContainSubstring("tool"))
		})

		It("should return error for unknown message types", func() {
			// Create a message with no known type
			messages := []genai.Message{{}}
			_, err := serializeMessages(messages)
			Expect(err).To(HaveOccurred())
			Expect(err.Error()).To(Equal("unknown message type encountered during serialization"))
		})
	})
})
