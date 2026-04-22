/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	eventnoop "mckinsey.com/ark/internal/eventing/noop"
)

var _ = Describe("A2AServer Controller", func() {
	ctx := context.Background()

	It("should not error when updating status of a deleted A2AServer", func() {
		const deletedName = "test-deleted-status-a2aserver"

		deletedA2AServer := &arkv1prealpha1.A2AServer{
			ObjectMeta: metav1.ObjectMeta{
				Name:      deletedName,
				Namespace: "default",
			},
			Spec: arkv1prealpha1.A2AServerSpec{
				Address: arkv1prealpha1.ValueSource{Value: "http://localhost:8080"},
			},
		}
		Expect(k8sClient.Create(ctx, deletedA2AServer)).To(Succeed())

		controllerReconciler := &A2AServerReconciler{
			Client:   k8sClient,
			Scheme:   k8sClient.Scheme(),
			Eventing: eventnoop.NewProvider(),
		}

		By("reconciling to initialize status")
		_, err := controllerReconciler.Reconcile(ctx, reconcile.Request{
			NamespacedName: types.NamespacedName{Name: deletedName, Namespace: "default"},
		})
		Expect(err).NotTo(HaveOccurred())

		By("deleting the A2AServer")
		Expect(k8sClient.Delete(ctx, deletedA2AServer)).To(Succeed())

		By("calling updateStatusWithConditions on the deleted A2AServer should not error")
		Expect(controllerReconciler.updateStatusWithConditions(ctx, deletedA2AServer)).To(Succeed())
	})
})
