/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes/scheme"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

var _ = Describe("Memory Controller", func() {
	Context("When reconciling a resource", func() {
		const resourceName = "test-resource"

		ctx := context.Background()

		typeNamespacedName := types.NamespacedName{
			Name:      resourceName,
			Namespace: "default", // TODO(user):Modify as needed
		}
		memory := &arkv1alpha1.Memory{}

		BeforeEach(func() {
			By("creating the custom resource for the Kind Memory")
			err := k8sClient.Get(ctx, typeNamespacedName, memory)
			if err != nil && errors.IsNotFound(err) {
				resource := &arkv1alpha1.Memory{
					ObjectMeta: metav1.ObjectMeta{
						Name:      resourceName,
						Namespace: "default",
					},
					Spec: arkv1alpha1.MemorySpec{
						Address: arkv1alpha1.ValueSource{
							Value: "http://test-memory-service:8080",
						},
					},
				}
				Expect(k8sClient.Create(ctx, resource)).To(Succeed())
			}
		})

		AfterEach(func() {
			// TODO(user): Cleanup logic after each test, like removing the resource instance.
			resource := &arkv1alpha1.Memory{}
			err := k8sClient.Get(ctx, typeNamespacedName, resource)
			Expect(err).NotTo(HaveOccurred())

			By("Cleanup the specific resource instance Memory")
			Expect(k8sClient.Delete(ctx, resource)).To(Succeed())
		})

		It("should successfully reconcile the resource", func() {
			By("Reconciling the created resource")
			controllerReconciler := &MemoryReconciler{
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

	Context("When reconciling memory with headers", func() {
		ctx := context.Background()

		AfterEach(func() {
			memoryList := &arkv1alpha1.MemoryList{}
			_ = k8sClient.List(ctx, memoryList)
			for _, m := range memoryList.Items {
				_ = k8sClient.Delete(ctx, &m)
			}

			secretList := &corev1.SecretList{}
			_ = k8sClient.List(ctx, secretList)
			for _, s := range secretList.Items {
				if s.Namespace == "default" {
					_ = k8sClient.Delete(ctx, &s)
				}
			}

			configMapList := &corev1.ConfigMapList{}
			_ = k8sClient.List(ctx, configMapList)
			for _, cm := range configMapList.Items {
				if cm.Namespace == "default" {
					_ = k8sClient.Delete(ctx, &cm)
				}
			}
		})

		It("should accept direct header values and reach ready status", func() {
			memoryName := "memory-direct-headers"
			memory := &arkv1alpha1.Memory{
				ObjectMeta: metav1.ObjectMeta{
					Name:      memoryName,
					Namespace: "default",
				},
				Spec: arkv1alpha1.MemorySpec{
					Address: arkv1alpha1.ValueSource{
						Value: "http://test-memory-service:8080",
					},
					Headers: []arkv1alpha1.Header{
						{
							Name: "X-Custom-Header",
							Value: arkv1alpha1.HeaderValue{
								Value: "custom-value",
							},
						},
						{
							Name: "Authorization",
							Value: arkv1alpha1.HeaderValue{
								Value: "Bearer static-token",
							},
						},
					},
				},
			}
			Expect(k8sClient.Create(ctx, memory)).To(Succeed())

			controllerReconciler := &MemoryReconciler{
				Client: k8sClient,
				Scheme: k8sClient.Scheme(),
			}

			By("First reconcile to set running state")
			_, err := controllerReconciler.Reconcile(ctx, reconcile.Request{
				NamespacedName: types.NamespacedName{Name: memoryName, Namespace: "default"},
			})
			Expect(err).NotTo(HaveOccurred())

			By("Second reconcile to validate and reach ready state")
			_, err = controllerReconciler.Reconcile(ctx, reconcile.Request{
				NamespacedName: types.NamespacedName{Name: memoryName, Namespace: "default"},
			})
			Expect(err).NotTo(HaveOccurred())

			By("Verifying memory reached ready state")
			updatedMemory := &arkv1alpha1.Memory{}
			Expect(k8sClient.Get(ctx, types.NamespacedName{Name: memoryName, Namespace: "default"}, updatedMemory)).To(Succeed())
			Expect(updatedMemory.Status.Phase).To(Equal(statusReady))
		})

		It("should accept header from secret and reach ready status", func() {
			memoryName := "memory-secret-headers"

			By("Creating a secret with the token")
			secret := &corev1.Secret{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "memory-token-secret",
					Namespace: "default",
				},
				Data: map[string][]byte{
					"token": []byte("secret-bearer-token"),
				},
			}
			Expect(k8sClient.Create(ctx, secret)).To(Succeed())

			By("Creating memory with header from secret")
			memory := &arkv1alpha1.Memory{
				ObjectMeta: metav1.ObjectMeta{
					Name:      memoryName,
					Namespace: "default",
				},
				Spec: arkv1alpha1.MemorySpec{
					Address: arkv1alpha1.ValueSource{
						Value: "http://test-memory-service:8080",
					},
					Headers: []arkv1alpha1.Header{
						{
							Name: "Authorization",
							Value: arkv1alpha1.HeaderValue{
								ValueFrom: &arkv1alpha1.HeaderValueSource{
									SecretKeyRef: &corev1.SecretKeySelector{
										LocalObjectReference: corev1.LocalObjectReference{
											Name: "memory-token-secret",
										},
										Key: "token",
									},
								},
							},
						},
					},
				},
			}
			Expect(k8sClient.Create(ctx, memory)).To(Succeed())

			controllerReconciler := &MemoryReconciler{
				Client: k8sClient,
				Scheme: k8sClient.Scheme(),
			}

			By("First reconcile to set running state")
			_, err := controllerReconciler.Reconcile(ctx, reconcile.Request{
				NamespacedName: types.NamespacedName{Name: memoryName, Namespace: "default"},
			})
			Expect(err).NotTo(HaveOccurred())

			By("Second reconcile to validate and reach ready state")
			_, err = controllerReconciler.Reconcile(ctx, reconcile.Request{
				NamespacedName: types.NamespacedName{Name: memoryName, Namespace: "default"},
			})
			Expect(err).NotTo(HaveOccurred())

			By("Verifying memory reached ready state")
			updatedMemory := &arkv1alpha1.Memory{}
			Expect(k8sClient.Get(ctx, types.NamespacedName{Name: memoryName, Namespace: "default"}, updatedMemory)).To(Succeed())
			Expect(updatedMemory.Status.Phase).To(Equal(statusReady))
		})

		It("should accept header from configmap and reach ready status", func() {
			memoryName := "memory-configmap-headers"

			By("Creating a configmap with the api key")
			configMap := &corev1.ConfigMap{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "memory-config",
					Namespace: "default",
				},
				Data: map[string]string{
					"api-key": "configmap-api-key-value",
				},
			}
			Expect(k8sClient.Create(ctx, configMap)).To(Succeed())

			By("Creating memory with header from configmap")
			memory := &arkv1alpha1.Memory{
				ObjectMeta: metav1.ObjectMeta{
					Name:      memoryName,
					Namespace: "default",
				},
				Spec: arkv1alpha1.MemorySpec{
					Address: arkv1alpha1.ValueSource{
						Value: "http://test-memory-service:8080",
					},
					Headers: []arkv1alpha1.Header{
						{
							Name: "X-API-Key",
							Value: arkv1alpha1.HeaderValue{
								ValueFrom: &arkv1alpha1.HeaderValueSource{
									ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
										LocalObjectReference: corev1.LocalObjectReference{
											Name: "memory-config",
										},
										Key: "api-key",
									},
								},
							},
						},
					},
				},
			}
			Expect(k8sClient.Create(ctx, memory)).To(Succeed())

			controllerReconciler := &MemoryReconciler{
				Client: k8sClient,
				Scheme: k8sClient.Scheme(),
			}

			By("First reconcile to set running state")
			_, err := controllerReconciler.Reconcile(ctx, reconcile.Request{
				NamespacedName: types.NamespacedName{Name: memoryName, Namespace: "default"},
			})
			Expect(err).NotTo(HaveOccurred())

			By("Second reconcile to validate and reach ready state")
			_, err = controllerReconciler.Reconcile(ctx, reconcile.Request{
				NamespacedName: types.NamespacedName{Name: memoryName, Namespace: "default"},
			})
			Expect(err).NotTo(HaveOccurred())

			By("Verifying memory reached ready state")
			updatedMemory := &arkv1alpha1.Memory{}
			Expect(k8sClient.Get(ctx, types.NamespacedName{Name: memoryName, Namespace: "default"}, updatedMemory)).To(Succeed())
			Expect(updatedMemory.Status.Phase).To(Equal(statusReady))
		})

		It("should accept mixed direct and referenced headers", func() {
			memoryName := "memory-mixed-headers"

			By("Creating a secret for one header")
			secret := &corev1.Secret{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "mixed-secret",
					Namespace: "default",
				},
				Data: map[string][]byte{
					"token": []byte("secret-token-value"),
				},
			}
			Expect(k8sClient.Create(ctx, secret)).To(Succeed())

			By("Creating memory with mixed headers")
			memory := &arkv1alpha1.Memory{
				ObjectMeta: metav1.ObjectMeta{
					Name:      memoryName,
					Namespace: "default",
				},
				Spec: arkv1alpha1.MemorySpec{
					Address: arkv1alpha1.ValueSource{
						Value: "http://test-memory-service:8080",
					},
					Headers: []arkv1alpha1.Header{
						{
							Name: "X-Direct-Header",
							Value: arkv1alpha1.HeaderValue{
								Value: "direct-value",
							},
						},
						{
							Name: "Authorization",
							Value: arkv1alpha1.HeaderValue{
								ValueFrom: &arkv1alpha1.HeaderValueSource{
									SecretKeyRef: &corev1.SecretKeySelector{
										LocalObjectReference: corev1.LocalObjectReference{
											Name: "mixed-secret",
										},
										Key: "token",
									},
								},
							},
						},
					},
				},
			}
			Expect(k8sClient.Create(ctx, memory)).To(Succeed())

			controllerReconciler := &MemoryReconciler{
				Client: k8sClient,
				Scheme: k8sClient.Scheme(),
			}

			By("First reconcile to set running state")
			_, err := controllerReconciler.Reconcile(ctx, reconcile.Request{
				NamespacedName: types.NamespacedName{Name: memoryName, Namespace: "default"},
			})
			Expect(err).NotTo(HaveOccurred())

			By("Second reconcile to validate and reach ready state")
			_, err = controllerReconciler.Reconcile(ctx, reconcile.Request{
				NamespacedName: types.NamespacedName{Name: memoryName, Namespace: "default"},
			})
			Expect(err).NotTo(HaveOccurred())

			By("Verifying memory reached ready state")
			updatedMemory := &arkv1alpha1.Memory{}
			Expect(k8sClient.Get(ctx, types.NamespacedName{Name: memoryName, Namespace: "default"}, updatedMemory)).To(Succeed())
			Expect(updatedMemory.Status.Phase).To(Equal(statusReady))
		})

		It("should work with empty headers", func() {
			memoryName := "memory-no-headers"

			By("Creating memory without headers")
			memory := &arkv1alpha1.Memory{
				ObjectMeta: metav1.ObjectMeta{
					Name:      memoryName,
					Namespace: "default",
				},
				Spec: arkv1alpha1.MemorySpec{
					Address: arkv1alpha1.ValueSource{
						Value: "http://test-memory-service:8080",
					},
				},
			}
			Expect(k8sClient.Create(ctx, memory)).To(Succeed())

			controllerReconciler := &MemoryReconciler{
				Client: k8sClient,
				Scheme: k8sClient.Scheme(),
			}

			By("First reconcile to set running state")
			_, err := controllerReconciler.Reconcile(ctx, reconcile.Request{
				NamespacedName: types.NamespacedName{Name: memoryName, Namespace: "default"},
			})
			Expect(err).NotTo(HaveOccurred())

			By("Second reconcile to validate and reach ready state")
			_, err = controllerReconciler.Reconcile(ctx, reconcile.Request{
				NamespacedName: types.NamespacedName{Name: memoryName, Namespace: "default"},
			})
			Expect(err).NotTo(HaveOccurred())

			By("Verifying memory reached ready state")
			updatedMemory := &arkv1alpha1.Memory{}
			Expect(k8sClient.Get(ctx, types.NamespacedName{Name: memoryName, Namespace: "default"}, updatedMemory)).To(Succeed())
			Expect(updatedMemory.Status.Phase).To(Equal(statusReady))
		})

		It("should accept headers with queryParameterRef in spec", func() {
			memoryName := "memory-with-query-param-ref"

			By("Creating memory with queryParameterRef header")
			memory := &arkv1alpha1.Memory{
				ObjectMeta: metav1.ObjectMeta{
					Name:      memoryName,
					Namespace: "default",
				},
				Spec: arkv1alpha1.MemorySpec{
					Address: arkv1alpha1.ValueSource{
						Value: "http://test-memory-service:8080",
					},
					Headers: []arkv1alpha1.Header{
						{
							Name: "X-User-ID",
							Value: arkv1alpha1.HeaderValue{
								ValueFrom: &arkv1alpha1.HeaderValueSource{
									QueryParameterRef: &arkv1alpha1.QueryParameterReference{
										Name: "userId",
									},
								},
							},
						},
						{
							Name: "X-Direct-Header",
							Value: arkv1alpha1.HeaderValue{
								Value: "direct-value",
							},
						},
					},
				},
			}
			Expect(k8sClient.Create(ctx, memory)).To(Succeed())

			controllerReconciler := &MemoryReconciler{
				Client: k8sClient,
				Scheme: k8sClient.Scheme(),
			}

			By("First reconcile to set running state")
			_, err := controllerReconciler.Reconcile(ctx, reconcile.Request{
				NamespacedName: types.NamespacedName{Name: memoryName, Namespace: "default"},
			})
			Expect(err).NotTo(HaveOccurred())

			By("Second reconcile to validate and reach ready state")
			_, err = controllerReconciler.Reconcile(ctx, reconcile.Request{
				NamespacedName: types.NamespacedName{Name: memoryName, Namespace: "default"},
			})
			Expect(err).NotTo(HaveOccurred())

			By("Verifying memory reached ready state with queryParameterRef in spec")
			updatedMemory := &arkv1alpha1.Memory{}
			Expect(k8sClient.Get(ctx, types.NamespacedName{Name: memoryName, Namespace: "default"}, updatedMemory)).To(Succeed())
			Expect(updatedMemory.Status.Phase).To(Equal(statusReady))
			Expect(updatedMemory.Spec.Headers).To(HaveLen(2))
			Expect(updatedMemory.Spec.Headers[0].Value.ValueFrom.QueryParameterRef.Name).To(Equal("userId"))
		})
	})

	// Regression for issue #2658: a transient/NotFound resolution failure must
	// not permanently strand a Memory in the error phase. ResolveValueSource
	// wraps a NotFound identically to a transient blip, so a missing-then-created
	// Secret exercises the self-heal path deterministically.
	Context("When a referenced Secret is initially missing (issue #2658)", func() {
		ctx := context.Background()

		AfterEach(func() {
			memoryList := &arkv1alpha1.MemoryList{}
			_ = k8sClient.List(ctx, memoryList)
			for i := range memoryList.Items {
				_ = k8sClient.Delete(ctx, &memoryList.Items[i])
			}
			secretList := &corev1.SecretList{}
			_ = k8sClient.List(ctx, secretList)
			for i := range secretList.Items {
				if secretList.Items[i].Namespace == "default" {
					_ = k8sClient.Delete(ctx, &secretList.Items[i])
				}
			}
			configMapList := &corev1.ConfigMapList{}
			_ = k8sClient.List(ctx, configMapList)
			for i := range configMapList.Items {
				if configMapList.Items[i].Namespace == "default" {
					_ = k8sClient.Delete(ctx, &configMapList.Items[i])
				}
			}
		})

		It("retries and self-heals to ready once the Secret appears", func() {
			memoryName := "memory-selfheal"
			secretName := "selfheal-secret"

			By("Creating a Memory whose address resolves from a not-yet-existing Secret")
			memory := &arkv1alpha1.Memory{
				ObjectMeta: metav1.ObjectMeta{
					Name:      memoryName,
					Namespace: "default",
				},
				Spec: arkv1alpha1.MemorySpec{
					Address: arkv1alpha1.ValueSource{
						ValueFrom: &arkv1alpha1.ValueFromSource{
							SecretKeyRef: &corev1.SecretKeySelector{
								LocalObjectReference: corev1.LocalObjectReference{Name: secretName},
								Key:                  "addr",
							},
						},
					},
				},
			}
			Expect(k8sClient.Create(ctx, memory)).To(Succeed())

			controllerReconciler := &MemoryReconciler{
				Client: k8sClient,
				Scheme: k8sClient.Scheme(),
			}
			nn := types.NamespacedName{Name: memoryName, Namespace: "default"}

			By("First reconcile initializes phase to running")
			_, err := controllerReconciler.Reconcile(ctx, reconcile.Request{NamespacedName: nn})
			Expect(err).NotTo(HaveOccurred())

			By("Second reconcile fails to resolve the missing Secret and sets error")
			result, err := controllerReconciler.Reconcile(ctx, reconcile.Request{NamespacedName: nn})
			Expect(err).NotTo(HaveOccurred())

			errored := &arkv1alpha1.Memory{}
			Expect(k8sClient.Get(ctx, nn, errored)).To(Succeed())
			Expect(errored.Status.Phase).To(Equal(statusError))

			By("A retry is scheduled so the resource is not permanently stranded")
			Expect(result.RequeueAfter).To(BeNumerically(">", 0))

			By("Creating the Secret so resolution now succeeds")
			secret := &corev1.Secret{
				ObjectMeta: metav1.ObjectMeta{
					Name:      secretName,
					Namespace: "default",
				},
				Data: map[string][]byte{
					"addr": []byte("http://healed-memory-service:8080"),
				},
			}
			Expect(k8sClient.Create(ctx, secret)).To(Succeed())

			By("Reconciling from the error phase reprocesses and reaches ready")
			_, err = controllerReconciler.Reconcile(ctx, reconcile.Request{NamespacedName: nn})
			Expect(err).NotTo(HaveOccurred())

			healed := &arkv1alpha1.Memory{}
			Expect(k8sClient.Get(ctx, nn, healed)).To(Succeed())
			Expect(healed.Status.Phase).To(Equal(statusReady))
			Expect(healed.Status.LastResolvedAddress).NotTo(BeNil())
			Expect(*healed.Status.LastResolvedAddress).To(Equal("http://healed-memory-service:8080"))
		})

		It("recovers from the error phase when the spec is edited", func() {
			memoryName := "memory-specedit-recover"

			By("Creating a Memory already stuck in the error phase")
			memory := &arkv1alpha1.Memory{
				ObjectMeta: metav1.ObjectMeta{
					Name:      memoryName,
					Namespace: "default",
				},
				Spec: arkv1alpha1.MemorySpec{
					Address: arkv1alpha1.ValueSource{
						Value: "http://valid-memory-service:8080",
					},
				},
			}
			Expect(k8sClient.Create(ctx, memory)).To(Succeed())
			memory.Status.Phase = statusError
			memory.Status.Message = "Failed to resolve address: simulated"
			Expect(k8sClient.Status().Update(ctx, memory)).To(Succeed())

			controllerReconciler := &MemoryReconciler{
				Client: k8sClient,
				Scheme: k8sClient.Scheme(),
			}
			nn := types.NamespacedName{Name: memoryName, Namespace: "default"}

			By("Reconciling an errored resource with a valid address reaches ready")
			_, err := controllerReconciler.Reconcile(ctx, reconcile.Request{NamespacedName: nn})
			Expect(err).NotTo(HaveOccurred())

			healed := &arkv1alpha1.Memory{}
			Expect(k8sClient.Get(ctx, nn, healed)).To(Succeed())
			Expect(healed.Status.Phase).To(Equal(statusReady))
		})

		It("stays terminal in the ready phase without reprocessing", func() {
			memoryName := "memory-ready-terminal"
			memory := &arkv1alpha1.Memory{
				ObjectMeta: metav1.ObjectMeta{Name: memoryName, Namespace: "default"},
				Spec: arkv1alpha1.MemorySpec{
					Address: arkv1alpha1.ValueSource{Value: "http://ready:8080"},
				},
			}
			Expect(k8sClient.Create(ctx, memory)).To(Succeed())
			memory.Status.Phase = statusReady
			Expect(k8sClient.Status().Update(ctx, memory)).To(Succeed())

			controllerReconciler := &MemoryReconciler{Client: k8sClient, Scheme: k8sClient.Scheme()}
			nn := types.NamespacedName{Name: memoryName, Namespace: "default"}

			result, err := controllerReconciler.Reconcile(ctx, reconcile.Request{NamespacedName: nn})
			Expect(err).NotTo(HaveOccurred())
			Expect(result.RequeueAfter).To(BeZero())

			after := &arkv1alpha1.Memory{}
			Expect(k8sClient.Get(ctx, nn, after)).To(Succeed())
			Expect(after.Status.Phase).To(Equal(statusReady))
		})

		It("errors and schedules a retry when the resolved address is empty", func() {
			memoryName := "memory-empty-addr"
			secretName := "empty-addr-secret"

			By("Creating a Secret whose value is empty")
			secret := &corev1.Secret{
				ObjectMeta: metav1.ObjectMeta{Name: secretName, Namespace: "default"},
				Data:       map[string][]byte{"addr": []byte("")},
			}
			Expect(k8sClient.Create(ctx, secret)).To(Succeed())

			memory := &arkv1alpha1.Memory{
				ObjectMeta: metav1.ObjectMeta{Name: memoryName, Namespace: "default"},
				Spec: arkv1alpha1.MemorySpec{
					Address: arkv1alpha1.ValueSource{
						ValueFrom: &arkv1alpha1.ValueFromSource{
							SecretKeyRef: &corev1.SecretKeySelector{
								LocalObjectReference: corev1.LocalObjectReference{Name: secretName},
								Key:                  "addr",
							},
						},
					},
				},
			}
			Expect(k8sClient.Create(ctx, memory)).To(Succeed())

			controllerReconciler := &MemoryReconciler{Client: k8sClient, Scheme: k8sClient.Scheme()}
			nn := types.NamespacedName{Name: memoryName, Namespace: "default"}

			_, err := controllerReconciler.Reconcile(ctx, reconcile.Request{NamespacedName: nn})
			Expect(err).NotTo(HaveOccurred())
			result, err := controllerReconciler.Reconcile(ctx, reconcile.Request{NamespacedName: nn})
			Expect(err).NotTo(HaveOccurred())
			Expect(result.RequeueAfter).To(BeNumerically(">", 0))

			errored := &arkv1alpha1.Memory{}
			Expect(k8sClient.Get(ctx, nn, errored)).To(Succeed())
			Expect(errored.Status.Phase).To(Equal(statusError))
		})

		It("registers the controller with the manager", func() {
			mgr, err := ctrl.NewManager(cfg, ctrl.Options{Scheme: scheme.Scheme})
			Expect(err).NotTo(HaveOccurred())
			r := &MemoryReconciler{Client: mgr.GetClient(), Scheme: mgr.GetScheme()}
			Expect(r.SetupWithManager(mgr)).To(Succeed())
		})

		It("maps a changed ConfigMap to the Memories that reference it", func() {
			configMapName := "mapped-configmap"
			referencing := &arkv1alpha1.Memory{
				ObjectMeta: metav1.ObjectMeta{Name: "mem-ref-cm", Namespace: "default"},
				Spec: arkv1alpha1.MemorySpec{
					Address: arkv1alpha1.ValueSource{
						ValueFrom: &arkv1alpha1.ValueFromSource{
							ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
								LocalObjectReference: corev1.LocalObjectReference{Name: configMapName},
								Key:                  "addr",
							},
						},
					},
				},
			}
			Expect(k8sClient.Create(ctx, referencing)).To(Succeed())

			controllerReconciler := &MemoryReconciler{Client: k8sClient, Scheme: k8sClient.Scheme()}
			cm := &corev1.ConfigMap{ObjectMeta: metav1.ObjectMeta{Name: configMapName, Namespace: "default"}}
			requests := controllerReconciler.mapConfigMapToMemories(ctx, cm)
			Expect(requests).To(ConsistOf(reconcile.Request{
				NamespacedName: types.NamespacedName{Name: "mem-ref-cm", Namespace: "default"},
			}))
		})

		It("maps a changed Secret to the Memories that reference it", func() {
			secretName := "mapped-secret"
			By("Creating one Memory referencing the Secret and one that does not")
			referencing := &arkv1alpha1.Memory{
				ObjectMeta: metav1.ObjectMeta{Name: "mem-ref-secret", Namespace: "default"},
				Spec: arkv1alpha1.MemorySpec{
					Address: arkv1alpha1.ValueSource{
						ValueFrom: &arkv1alpha1.ValueFromSource{
							SecretKeyRef: &corev1.SecretKeySelector{
								LocalObjectReference: corev1.LocalObjectReference{Name: secretName},
								Key:                  "addr",
							},
						},
					},
				},
			}
			unrelated := &arkv1alpha1.Memory{
				ObjectMeta: metav1.ObjectMeta{Name: "mem-direct", Namespace: "default"},
				Spec: arkv1alpha1.MemorySpec{
					Address: arkv1alpha1.ValueSource{Value: "http://direct:8080"},
				},
			}
			Expect(k8sClient.Create(ctx, referencing)).To(Succeed())
			Expect(k8sClient.Create(ctx, unrelated)).To(Succeed())

			controllerReconciler := &MemoryReconciler{
				Client: k8sClient,
				Scheme: k8sClient.Scheme(),
			}

			secret := &corev1.Secret{
				ObjectMeta: metav1.ObjectMeta{Name: secretName, Namespace: "default"},
			}
			requests := controllerReconciler.mapSecretToMemories(ctx, secret)
			Expect(requests).To(ConsistOf(reconcile.Request{
				NamespacedName: types.NamespacedName{Name: "mem-ref-secret", Namespace: "default"},
			}))
		})
	})
})
