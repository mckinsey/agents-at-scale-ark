/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	eventnoop "mckinsey.com/ark/internal/eventing/noop"
)

var _ = Describe("MCPServer Controller", func() {
	ctx := context.Background()

	It("should not error when updating status of a deleted MCPServer", func() {
		const deletedName = "test-deleted-status-mcpserver"

		deletedMCPServer := &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{
				Name:      deletedName,
				Namespace: "default",
			},
			Spec: arkv1alpha1.MCPServerSpec{
				Address:   arkv1alpha1.ValueSource{Value: "http://localhost:8080"},
				Transport: "http",
			},
		}
		Expect(k8sClient.Create(ctx, deletedMCPServer)).To(Succeed())

		controllerReconciler := &MCPServerReconciler{
			Client:   k8sClient,
			Scheme:   k8sClient.Scheme(),
			Eventing: eventnoop.NewProvider(),
		}

		By("reconciling to initialize status")
		_, err := controllerReconciler.Reconcile(ctx, reconcile.Request{
			NamespacedName: types.NamespacedName{Name: deletedName, Namespace: "default"},
		})
		Expect(err).NotTo(HaveOccurred())

		By("deleting the MCPServer")
		Expect(k8sClient.Delete(ctx, deletedMCPServer)).To(Succeed())

		By("calling updateStatus on the deleted MCPServer should not error")
		Expect(controllerReconciler.updateStatus(ctx, deletedMCPServer)).To(Succeed())
	})
})
