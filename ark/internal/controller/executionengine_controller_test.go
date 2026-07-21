/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes/scheme"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	eventnoop "mckinsey.com/ark/internal/eventing/noop"
)

var _ = Describe("ExecutionEngine Controller", func() {
	ctx := context.Background()

	newReconciler := func() *ExecutionEngineReconciler {
		return &ExecutionEngineReconciler{
			Client:   k8sClient,
			Scheme:   k8sClient.Scheme(),
			Eventing: eventnoop.NewProvider(),
		}
	}

	AfterEach(func() {
		engineList := &arkv1prealpha1.ExecutionEngineList{}
		_ = k8sClient.List(ctx, engineList)
		for i := range engineList.Items {
			_ = k8sClient.Delete(ctx, &engineList.Items[i])
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

	Context("When reconciling with a direct address value", func() {
		It("reaches ready", func() {
			name := "ee-direct"
			engine := &arkv1prealpha1.ExecutionEngine{
				ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "default"},
				Spec: arkv1prealpha1.ExecutionEngineSpec{
					Address: arkv1prealpha1.ValueSource{Value: "http://engine:8080"},
				},
			}
			Expect(k8sClient.Create(ctx, engine)).To(Succeed())

			r := newReconciler()
			nn := types.NamespacedName{Name: name, Namespace: "default"}

			_, err := r.Reconcile(ctx, reconcile.Request{NamespacedName: nn})
			Expect(err).NotTo(HaveOccurred())
			_, err = r.Reconcile(ctx, reconcile.Request{NamespacedName: nn})
			Expect(err).NotTo(HaveOccurred())

			updated := &arkv1prealpha1.ExecutionEngine{}
			Expect(k8sClient.Get(ctx, nn, updated)).To(Succeed())
			Expect(updated.Status.Phase).To(Equal(statusReady))
		})
	})

	// Regression for issue #2658: an ExecutionEngine must not be permanently
	// stranded in the error phase by a transient/NotFound resolution failure.
	Context("When a referenced Secret is initially missing (issue #2658)", func() {
		It("retries and self-heals to ready once the Secret appears", func() {
			name := "ee-selfheal"
			secretName := "ee-selfheal-secret"

			engine := &arkv1prealpha1.ExecutionEngine{
				ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "default"},
				Spec: arkv1prealpha1.ExecutionEngineSpec{
					Address: arkv1prealpha1.ValueSource{
						ValueFrom: &arkv1prealpha1.ValueFromSource{
							SecretKeyRef: &corev1.SecretKeySelector{
								LocalObjectReference: corev1.LocalObjectReference{Name: secretName},
								Key:                  "addr",
							},
						},
					},
				},
			}
			Expect(k8sClient.Create(ctx, engine)).To(Succeed())

			r := newReconciler()
			nn := types.NamespacedName{Name: name, Namespace: "default"}

			By("First reconcile initializes phase to running")
			_, err := r.Reconcile(ctx, reconcile.Request{NamespacedName: nn})
			Expect(err).NotTo(HaveOccurred())

			By("Second reconcile fails to resolve the missing Secret and sets error")
			result, err := r.Reconcile(ctx, reconcile.Request{NamespacedName: nn})
			Expect(err).NotTo(HaveOccurred())

			errored := &arkv1prealpha1.ExecutionEngine{}
			Expect(k8sClient.Get(ctx, nn, errored)).To(Succeed())
			Expect(errored.Status.Phase).To(Equal(statusError))

			By("A retry is scheduled so the resource is not permanently stranded")
			Expect(result.RequeueAfter).To(BeNumerically(">", 0))

			By("Creating the Secret so resolution now succeeds")
			secret := &corev1.Secret{
				ObjectMeta: metav1.ObjectMeta{Name: secretName, Namespace: "default"},
				Data:       map[string][]byte{"addr": []byte("http://healed-engine:8080")},
			}
			Expect(k8sClient.Create(ctx, secret)).To(Succeed())

			By("Reconciling from the error phase reprocesses and reaches ready")
			_, err = r.Reconcile(ctx, reconcile.Request{NamespacedName: nn})
			Expect(err).NotTo(HaveOccurred())

			healed := &arkv1prealpha1.ExecutionEngine{}
			Expect(k8sClient.Get(ctx, nn, healed)).To(Succeed())
			Expect(healed.Status.Phase).To(Equal(statusReady))
			Expect(healed.Status.LastResolvedAddress).To(Equal("http://healed-engine:8080"))
		})

		It("stays terminal in the ready phase without reprocessing", func() {
			name := "ee-ready-terminal"
			engine := &arkv1prealpha1.ExecutionEngine{
				ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "default"},
				Spec: arkv1prealpha1.ExecutionEngineSpec{
					Address: arkv1prealpha1.ValueSource{Value: "http://ready:8080"},
				},
			}
			Expect(k8sClient.Create(ctx, engine)).To(Succeed())
			engine.Status.Phase = statusReady
			Expect(k8sClient.Status().Update(ctx, engine)).To(Succeed())

			r := newReconciler()
			nn := types.NamespacedName{Name: name, Namespace: "default"}
			result, err := r.Reconcile(ctx, reconcile.Request{NamespacedName: nn})
			Expect(err).NotTo(HaveOccurred())
			Expect(result.RequeueAfter).To(BeZero())

			after := &arkv1prealpha1.ExecutionEngine{}
			Expect(k8sClient.Get(ctx, nn, after)).To(Succeed())
			Expect(after.Status.Phase).To(Equal(statusReady))
		})

		It("registers the controller with the manager", func() {
			mgr, err := ctrl.NewManager(cfg, ctrl.Options{Scheme: scheme.Scheme})
			Expect(err).NotTo(HaveOccurred())
			r := &ExecutionEngineReconciler{
				Client:   mgr.GetClient(),
				Scheme:   mgr.GetScheme(),
				Eventing: eventnoop.NewProvider(),
			}
			Expect(r.SetupWithManager(mgr)).To(Succeed())
		})

		It("maps a changed ConfigMap to the ExecutionEngines that reference it", func() {
			configMapName := "ee-mapped-configmap"
			referencing := &arkv1prealpha1.ExecutionEngine{
				ObjectMeta: metav1.ObjectMeta{Name: "ee-ref-cm", Namespace: "default"},
				Spec: arkv1prealpha1.ExecutionEngineSpec{
					Address: arkv1prealpha1.ValueSource{
						ValueFrom: &arkv1prealpha1.ValueFromSource{
							ConfigMapKeyRef: &corev1.ConfigMapKeySelector{
								LocalObjectReference: corev1.LocalObjectReference{Name: configMapName},
								Key:                  "addr",
							},
						},
					},
				},
			}
			Expect(k8sClient.Create(ctx, referencing)).To(Succeed())

			r := newReconciler()
			cm := &corev1.ConfigMap{ObjectMeta: metav1.ObjectMeta{Name: configMapName, Namespace: "default"}}
			requests := r.mapConfigMapToExecutionEngines(ctx, cm)
			Expect(requests).To(ConsistOf(reconcile.Request{
				NamespacedName: types.NamespacedName{Name: "ee-ref-cm", Namespace: "default"},
			}))
		})

		It("maps a changed Secret to the ExecutionEngines that reference it", func() {
			secretName := "ee-mapped-secret"
			referencing := &arkv1prealpha1.ExecutionEngine{
				ObjectMeta: metav1.ObjectMeta{Name: "ee-ref-secret", Namespace: "default"},
				Spec: arkv1prealpha1.ExecutionEngineSpec{
					Address: arkv1prealpha1.ValueSource{
						ValueFrom: &arkv1prealpha1.ValueFromSource{
							SecretKeyRef: &corev1.SecretKeySelector{
								LocalObjectReference: corev1.LocalObjectReference{Name: secretName},
								Key:                  "addr",
							},
						},
					},
				},
			}
			unrelated := &arkv1prealpha1.ExecutionEngine{
				ObjectMeta: metav1.ObjectMeta{Name: "ee-direct-map", Namespace: "default"},
				Spec: arkv1prealpha1.ExecutionEngineSpec{
					Address: arkv1prealpha1.ValueSource{Value: "http://direct:8080"},
				},
			}
			Expect(k8sClient.Create(ctx, referencing)).To(Succeed())
			Expect(k8sClient.Create(ctx, unrelated)).To(Succeed())

			r := newReconciler()
			secret := &corev1.Secret{
				ObjectMeta: metav1.ObjectMeta{Name: secretName, Namespace: "default"},
			}
			requests := r.mapSecretToExecutionEngines(ctx, secret)
			Expect(requests).To(ConsistOf(reconcile.Request{
				NamespacedName: types.NamespacedName{Name: "ee-ref-secret", Namespace: "default"},
			}))
		})
	})
})
