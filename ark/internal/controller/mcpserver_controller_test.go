/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"time"

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

	It("maps a changed Secret to the MCPServers that reference it", func() {
		const secretName = "mapped-mcp-secret"

		byAddress := &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: "mcp-ref-secret-address", Namespace: "default"},
			Spec: arkv1alpha1.MCPServerSpec{
				Address: arkv1alpha1.ValueSource{
					ValueFrom: &arkv1alpha1.ValueFromSource{
						SecretKeyRef: &corev1.SecretKeySelector{
							LocalObjectReference: corev1.LocalObjectReference{Name: secretName},
							Key:                  "value",
						},
					},
				},
				Transport: "http",
			},
		}
		byHeader := &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: "mcp-ref-secret-header", Namespace: "default"},
			Spec: arkv1alpha1.MCPServerSpec{
				Address:   arkv1alpha1.ValueSource{Value: "http://localhost:8080"},
				Transport: "http",
				Headers: []arkv1alpha1.Header{{
					Name: "X-Api-Key",
					Value: arkv1alpha1.HeaderValue{
						ValueFrom: &arkv1alpha1.HeaderValueSource{
							SecretKeyRef: &corev1.SecretKeySelector{
								LocalObjectReference: corev1.LocalObjectReference{Name: secretName},
								Key:                  "value",
							},
						},
					},
				}},
			},
		}
		byAuthorization := &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: "mcp-ref-secret-authorization", Namespace: "default"},
			Spec: arkv1alpha1.MCPServerSpec{
				Address:   arkv1alpha1.ValueSource{Value: "http://localhost:8080"},
				Transport: "http",
				Authorization: &arkv1alpha1.MCPServerAuthorizationSpec{
					TokenSecretRef: arkv1alpha1.TokenSecretReference{Name: secretName},
				},
			},
		}
		// A rotated signing key is the case a poll-only design notices late.
		// The token ref points elsewhere so the match can only come from the key.
		bySigningKey := &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: "mcp-ref-secret-signing-key", Namespace: "default"},
			Spec: arkv1alpha1.MCPServerSpec{
				Address:   arkv1alpha1.ValueSource{Value: "http://localhost:8080"},
				Transport: "http",
				Authorization: &arkv1alpha1.MCPServerAuthorizationSpec{
					TokenSecretRef: arkv1alpha1.TokenSecretReference{Name: "some-other-secret"},
					ClientCredentials: &arkv1alpha1.ClientCredentialsSpec{
						ClientID: "ark-client",
						ClientAuthentication: arkv1alpha1.ClientAuthenticationSpec{
							PrivateKeyJWT: &arkv1alpha1.PrivateKeyJWTSpec{
								SecretKeyRef: arkv1alpha1.SigningKeySecretKeyRef{
									Name: secretName,
									Key:  "private.pem",
								},
								Algorithm: "ES256",
							},
						},
					},
				},
			},
		}
		unrelated := &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: "mcp-ref-secret-unrelated", Namespace: "default"},
			Spec: arkv1alpha1.MCPServerSpec{
				Address:   arkv1alpha1.ValueSource{Value: "http://localhost:8080"},
				Transport: "http",
				Authorization: &arkv1alpha1.MCPServerAuthorizationSpec{
					TokenSecretRef: arkv1alpha1.TokenSecretReference{Name: "some-other-secret"},
				},
			},
		}
		// Same name, different namespace: a Secret must never enqueue across one.
		elsewhereNamespace := &corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "mcp-secret-other-ns"}}
		elsewhere := &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: "mcp-ref-secret-elsewhere", Namespace: elsewhereNamespace.Name},
			Spec: arkv1alpha1.MCPServerSpec{
				Address:   arkv1alpha1.ValueSource{Value: "http://localhost:8080"},
				Transport: "http",
				Authorization: &arkv1alpha1.MCPServerAuthorizationSpec{
					TokenSecretRef: arkv1alpha1.TokenSecretReference{Name: secretName},
				},
			},
		}
		Expect(k8sClient.Create(ctx, byAddress)).To(Succeed())
		Expect(k8sClient.Create(ctx, byHeader)).To(Succeed())
		Expect(k8sClient.Create(ctx, byAuthorization)).To(Succeed())
		Expect(k8sClient.Create(ctx, bySigningKey)).To(Succeed())
		Expect(k8sClient.Create(ctx, unrelated)).To(Succeed())
		Expect(k8sClient.Create(ctx, elsewhereNamespace)).To(Succeed())
		Expect(k8sClient.Create(ctx, elsewhere)).To(Succeed())

		controllerReconciler := &MCPServerReconciler{
			Client:   k8sClient,
			Scheme:   k8sClient.Scheme(),
			Eventing: eventnoop.NewProvider(),
		}

		secret := &corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{Name: secretName, Namespace: "default"},
		}
		requests := controllerReconciler.mapSecretToMCPServers(ctx, secret)

		Expect(requests).To(ConsistOf(
			reconcile.Request{NamespacedName: types.NamespacedName{Name: "mcp-ref-secret-address", Namespace: "default"}},
			reconcile.Request{NamespacedName: types.NamespacedName{Name: "mcp-ref-secret-header", Namespace: "default"}},
			reconcile.Request{NamespacedName: types.NamespacedName{Name: "mcp-ref-secret-authorization", Namespace: "default"}},
			reconcile.Request{NamespacedName: types.NamespacedName{Name: "mcp-ref-secret-signing-key", Namespace: "default"}},
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

	It("preserves an operator-set approval gate across tool rediscovery", func() {
		const toolName = "mcp-tool-with-approval"

		controllerReconciler := &MCPServerReconciler{
			Client:   k8sClient,
			Scheme:   k8sClient.Scheme(),
			Eventing: eventnoop.NewProvider(),
		}

		By("storing a discovered tool that an operator has gated")
		gated := &arkv1alpha1.Tool{
			ObjectMeta: metav1.ObjectMeta{Name: toolName, Namespace: "default"},
			Spec: arkv1alpha1.ToolSpec{
				Type:        "mcp",
				Description: "write a file",
				MCP: &arkv1alpha1.MCPToolRef{
					MCPServerRef: arkv1alpha1.MCPServerRef{Name: "fg", Namespace: "default"},
					ToolName:     "file-gateway-write-file",
				},
				Approval: &arkv1alpha1.ToolApprovalConfig{
					Required:  true,
					OnTimeout: "reject",
					Timeout:   &metav1.Duration{Duration: 5 * time.Minute},
				},
			},
		}
		Expect(k8sClient.Create(ctx, gated)).To(Succeed())
		DeferCleanup(func() { Expect(k8sClient.Delete(ctx, gated)).To(Succeed()) })

		By("rediscovering the tool, which rebuilds the spec without any approval block")
		rediscovered := &arkv1alpha1.Tool{
			ObjectMeta: metav1.ObjectMeta{Name: toolName, Namespace: "default"},
			Spec: arkv1alpha1.ToolSpec{
				Type:        "mcp",
				Description: "write a file, now with a new description",
				MCP: &arkv1alpha1.MCPToolRef{
					MCPServerRef: arkv1alpha1.MCPServerRef{Name: "fg", Namespace: "default"},
					ToolName:     "file-gateway-write-file",
				},
			},
		}
		_, err := controllerReconciler.createOrUpdateSingleTool(ctx, rediscovered, toolName, "fg")
		Expect(err).NotTo(HaveOccurred())

		By("keeping the gate while still applying the discovered change")
		stored := &arkv1alpha1.Tool{}
		Expect(k8sClient.Get(ctx, types.NamespacedName{Name: toolName, Namespace: "default"}, stored)).To(Succeed())
		Expect(stored.Spec.Description).To(Equal("write a file, now with a new description"))
		Expect(stored.Spec.Approval).NotTo(BeNil())
		Expect(stored.Spec.Approval.Required).To(BeTrue())
		Expect(stored.Spec.Approval.OnTimeout).To(Equal("reject"))
		Expect(stored.Spec.Approval.Timeout.Duration).To(Equal(5 * time.Minute))

		By("reporting no change when only the carried-over approval would differ")
		unchanged := rediscovered.DeepCopy()
		unchanged.Spec.Approval = nil
		updated, err := controllerReconciler.createOrUpdateSingleTool(ctx, unchanged, toolName, "fg")
		Expect(err).NotTo(HaveOccurred())
		Expect(updated).To(BeFalse())
	})
})
