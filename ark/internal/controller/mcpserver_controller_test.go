/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	corev1 "k8s.io/api/core/v1"
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

	It("maps a changed ConfigMap to the MCPServers that reference it", func() {
		const configMapName = "mapped-mcp-configuration"

		byAddress := &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: "mcp-ref-cm-address", Namespace: "default"},
			Spec: arkv1alpha1.MCPServerSpec{
				Address: arkv1alpha1.ValueSource{
					ValueFrom: &arkv1alpha1.ValueFromSource{
						ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
							LocalObjectReference: corev1.LocalObjectReference{Name: configMapName},
							Key:                  "value",
						},
					},
				},
				Transport: "http",
			},
		}
		byHeader := &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: "mcp-ref-cm-header", Namespace: "default"},
			Spec: arkv1alpha1.MCPServerSpec{
				Address:   arkv1alpha1.ValueSource{Value: "http://localhost:8080"},
				Transport: "http",
				Headers: []arkv1alpha1.Header{{
					Name: "X-Tenant",
					Value: arkv1alpha1.HeaderValue{
						ValueFrom: &arkv1alpha1.HeaderValueSource{
							ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
								LocalObjectReference: corev1.LocalObjectReference{Name: configMapName},
								Key:                  "value",
							},
						},
					},
				}},
			},
		}
		unrelated := &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: "mcp-ref-cm-unrelated", Namespace: "default"},
			Spec: arkv1alpha1.MCPServerSpec{
				Address: arkv1alpha1.ValueSource{
					ValueFrom: &arkv1alpha1.ValueFromSource{
						ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
							LocalObjectReference: corev1.LocalObjectReference{Name: "some-other-configuration"},
							Key:                  "value",
						},
					},
				},
				Transport: "http",
			},
		}
		Expect(k8sClient.Create(ctx, byAddress)).To(Succeed())
		Expect(k8sClient.Create(ctx, byHeader)).To(Succeed())
		Expect(k8sClient.Create(ctx, unrelated)).To(Succeed())

		controllerReconciler := &MCPServerReconciler{
			Client:   k8sClient,
			Scheme:   k8sClient.Scheme(),
			Eventing: eventnoop.NewProvider(),
		}

		configMap := &corev1.ConfigMap{
			ObjectMeta: metav1.ObjectMeta{Name: configMapName, Namespace: "default"},
		}
		requests := controllerReconciler.mapConfigMapToMCPServers(ctx, configMap)

		Expect(requests).To(ConsistOf(
			reconcile.Request{NamespacedName: types.NamespacedName{Name: "mcp-ref-cm-address", Namespace: "default"}},
			reconcile.Request{NamespacedName: types.NamespacedName{Name: "mcp-ref-cm-header", Namespace: "default"}},
		))
	})

	It("maps a ConfigMap referenced by nothing to no requests", func() {
		controllerReconciler := &MCPServerReconciler{
			Client:   k8sClient,
			Scheme:   k8sClient.Scheme(),
			Eventing: eventnoop.NewProvider(),
		}

		configMap := &corev1.ConfigMap{
			ObjectMeta: metav1.ObjectMeta{Name: "referenced-by-nothing", Namespace: "default"},
		}
		Expect(controllerReconciler.mapConfigMapToMCPServers(ctx, configMap)).To(BeEmpty())
	})
})
