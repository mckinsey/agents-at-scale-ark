/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/tools/record"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

var _ = Describe("Agent Controller", func() {
	Context("When reconciling a resource", func() {
		const resourceName = "test-resource"

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
							Name: "test-model",
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
				Recorder: record.NewFakeRecorder(10),
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
					ModelRef: nil, // No explicit model - should use default
					Prompt:   "test prompt for default model",
				},
			}
			Expect(k8sClient.Create(ctx, defaultModelAgent)).To(Succeed())

			By("Reconciling the agent with no explicit model")
			controllerReconciler := &AgentReconciler{
				Client:   k8sClient,
				Scheme:   k8sClient.Scheme(),
				Recorder: record.NewFakeRecorder(10),
			}

			_, err := controllerReconciler.Reconcile(ctx, reconcile.Request{
				NamespacedName: defaultModelTypeNamespacedName,
			})
			Expect(err).NotTo(HaveOccurred())

			By("Cleanup the default model test resource")
			Expect(k8sClient.Delete(ctx, defaultModelAgent)).To(Succeed())
		})
	})
})
