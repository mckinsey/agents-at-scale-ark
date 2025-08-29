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
)

var _ = Describe("Tool Controller", func() {
	Context("When reconciling a resource", func() {
		const resourceName = "test-resource"

		ctx := context.Background()

		typeNamespacedName := types.NamespacedName{
			Name:      resourceName,
			Namespace: "default", // TODO(user):Modify as needed
		}
		tool := &arkv1alpha1.Tool{}

		BeforeEach(func() {
			By("creating the custom resource for the Kind Tool")
			err := k8sClient.Get(ctx, typeNamespacedName, tool)
			if err != nil && errors.IsNotFound(err) {
				resource := &arkv1alpha1.Tool{
					ObjectMeta: metav1.ObjectMeta{
						Name:      resourceName,
						Namespace: "default",
					},
					Spec: arkv1alpha1.ToolSpec{
						Type: "http",
						HTTP: &arkv1alpha1.HTTPSpec{
							URL:    "https://api.example.com/data",
							Method: "GET",
						},
					},
				}
				Expect(k8sClient.Create(ctx, resource)).To(Succeed())
			}
		})

		AfterEach(func() {
			// TODO(user): Cleanup logic after each test, like removing the resource instance.
			resource := &arkv1alpha1.Tool{}
			err := k8sClient.Get(ctx, typeNamespacedName, resource)
			Expect(err).NotTo(HaveOccurred())

			By("Cleanup the specific resource instance Tool")
			Expect(k8sClient.Delete(ctx, resource)).To(Succeed())
		})
		It("should successfully reconcile and validate the resource", func() {
			By("Reconciling the created resource")
			controllerReconciler := &ToolReconciler{
				Client: k8sClient,
				Scheme: k8sClient.Scheme(),
			}

			_, err := controllerReconciler.Reconcile(ctx, reconcile.Request{
				NamespacedName: typeNamespacedName,
			})
			Expect(err).NotTo(HaveOccurred())

			By("Checking that the tool status is updated to Ready")
			updatedTool := &arkv1alpha1.Tool{}
			err = k8sClient.Get(ctx, typeNamespacedName, updatedTool)
			Expect(err).NotTo(HaveOccurred())
			Expect(updatedTool.Status.State).To(Equal("Ready"))
			Expect(updatedTool.Status.Message).To(Equal("Tool configuration is valid"))
		})
	})
})
