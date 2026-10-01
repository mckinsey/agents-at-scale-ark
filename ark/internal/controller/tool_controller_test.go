/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"time"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/utils/ptr"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	metricsserver "sigs.k8s.io/controller-runtime/pkg/metrics/server"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/inlinetools"
	"mckinsey.com/ark/internal/inlinetools/runner"
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
			Expect(updatedTool.Status.Conditions).To(BeEmpty())
		})
	})

	Context("When reconciling an inline tool without the runtime installed", func() {
		const resourceName = "inline-resource"

		ctx := context.Background()
		typeNamespacedName := types.NamespacedName{Name: resourceName, Namespace: "default"}

		BeforeEach(func() {
			resource := &arkv1alpha1.Tool{
				ObjectMeta: metav1.ObjectMeta{Name: resourceName, Namespace: "default"},
				Spec: arkv1alpha1.ToolSpec{
					Type:   arkv1alpha1.ToolTypeInline,
					Inline: &arkv1alpha1.InlineSpec{Source: "print(1)", Language: "python"},
				},
			}
			Expect(k8sClient.Create(ctx, resource)).To(Succeed())
		})

		AfterEach(func() {
			resource := &arkv1alpha1.Tool{}
			Expect(k8sClient.Get(ctx, typeNamespacedName, resource)).To(Succeed())
			Expect(k8sClient.Delete(ctx, resource)).To(Succeed())

			// An inline Tool carries a finalizer, so deletion completes only
			// once the controller has removed its children.
			controllerReconciler := &ToolReconciler{Client: k8sClient, Scheme: k8sClient.Scheme()}
			Eventually(func() bool {
				_, err := controllerReconciler.Reconcile(ctx, reconcile.Request{NamespacedName: typeNamespacedName})
				Expect(err).NotTo(HaveOccurred())
				return errors.IsNotFound(k8sClient.Get(ctx, typeNamespacedName, &arkv1alpha1.Tool{}))
			}).Should(BeTrue())
		})

		It("reports Pending with RuntimeNotInstalled and no endpoint", func() {
			controllerReconciler := &ToolReconciler{Client: k8sClient, Scheme: k8sClient.Scheme()}

			_, err := controllerReconciler.Reconcile(ctx, reconcile.Request{NamespacedName: typeNamespacedName})
			Expect(err).NotTo(HaveOccurred())

			updatedTool := &arkv1alpha1.Tool{}
			Expect(k8sClient.Get(ctx, typeNamespacedName, updatedTool)).To(Succeed())
			Expect(updatedTool.Status.State).To(Equal(arkv1alpha1.ToolStatePending))
			Expect(updatedTool.Status.Message).To(ContainSubstring("not executable yet"))
			Expect(updatedTool.Status.ResolvedAddress).To(BeEmpty())

			condition := meta.FindStatusCondition(updatedTool.Status.Conditions, arkv1alpha1.ToolConditionAvailable)
			Expect(condition).NotTo(BeNil())
			Expect(condition.Status).To(Equal(metav1.ConditionFalse))
			Expect(condition.Reason).To(Equal(arkv1alpha1.ToolReasonRuntimeNotInstalled))
			Expect(condition.ObservedGeneration).To(Equal(updatedTool.Generation))
		})

		It("provisions no children while the feature is disabled", func() {
			controllerReconciler := &ToolReconciler{Client: k8sClient, Scheme: k8sClient.Scheme()}

			_, err := controllerReconciler.Reconcile(ctx, reconcile.Request{NamespacedName: typeNamespacedName})
			Expect(err).NotTo(HaveOccurred())

			deployment := &appsv1.Deployment{}
			err = k8sClient.Get(ctx, types.NamespacedName{Name: resourceName + "-runner", Namespace: "default"}, deployment)
			Expect(errors.IsNotFound(err)).To(BeTrue())
		})
	})

	Context("When reconciling an inline tool with inline tools enabled", func() {
		const resourceName = "inline-enabled"

		ctx := context.Background()
		typeNamespacedName := types.NamespacedName{Name: resourceName, Namespace: "default"}

		BeforeEach(func() {
			GinkgoT().Setenv(inlinetools.EnabledEnvVar, "true")
			GinkgoT().Setenv(runner.EnvImageRepository, "ghcr.io/example/ark-inline-runner")
			GinkgoT().Setenv(runner.EnvImageTag, "v1.2.3")

			resource := &arkv1alpha1.Tool{
				ObjectMeta: metav1.ObjectMeta{Name: resourceName, Namespace: "default"},
				Spec: arkv1alpha1.ToolSpec{
					Type:   arkv1alpha1.ToolTypeInline,
					Inline: &arkv1alpha1.InlineSpec{Source: "print(1)", Language: arkv1alpha1.InlineLanguagePython},
				},
			}
			Expect(k8sClient.Create(ctx, resource)).To(Succeed())
		})

		AfterEach(func() {
			resource := &arkv1alpha1.Tool{}
			Expect(k8sClient.Get(ctx, typeNamespacedName, resource)).To(Succeed())
			Expect(k8sClient.Delete(ctx, resource)).To(Succeed())

			// An inline Tool carries a finalizer, so deletion completes only
			// once the controller has removed its children.
			controllerReconciler := &ToolReconciler{Client: k8sClient, Scheme: k8sClient.Scheme()}
			Eventually(func() bool {
				_, err := controllerReconciler.Reconcile(ctx, reconcile.Request{NamespacedName: typeNamespacedName})
				Expect(err).NotTo(HaveOccurred())
				return errors.IsNotFound(k8sClient.Get(ctx, typeNamespacedName, &arkv1alpha1.Tool{}))
			}).Should(BeTrue())
		})

		It("provisions the owned children and still reports Pending", func() {
			controllerReconciler := &ToolReconciler{Client: k8sClient, Scheme: k8sClient.Scheme()}

			_, err := controllerReconciler.Reconcile(ctx, reconcile.Request{NamespacedName: typeNamespacedName})
			Expect(err).NotTo(HaveOccurred())

			names := inlineChildNames(resourceName)
			configMap := &corev1.ConfigMap{}
			Expect(k8sClient.Get(ctx, types.NamespacedName{Name: names.Source, Namespace: "default"}, configMap)).To(Succeed())
			Expect(configMap.Data[inlineSourceKey]).To(Equal("print(1)"))

			deployment := &appsv1.Deployment{}
			Expect(k8sClient.Get(ctx, types.NamespacedName{Name: names.Runner, Namespace: "default"}, deployment)).To(Succeed())
			Expect(*deployment.Spec.Replicas).To(Equal(int32(0)))
			Expect(deployment.OwnerReferences).To(HaveLen(1))

			service := &corev1.Service{}
			Expect(k8sClient.Get(ctx, types.NamespacedName{Name: names.Runner, Namespace: "default"}, service)).To(Succeed())

			// The API server re-normalizes the fields it assigns, so a redundant
			// write never moves resourceVersion: only a call counter can see it.
			serviceUpdates := 0
			counting := &serviceUpdateCounter{Client: k8sClient, updates: &serviceUpdates}
			steadyState := &ToolReconciler{Client: counting, Scheme: k8sClient.Scheme()}
			_, err = steadyState.Reconcile(ctx, reconcile.Request{NamespacedName: typeNamespacedName})
			Expect(err).NotTo(HaveOccurred())
			Expect(serviceUpdates).To(Equal(0), "a steady-state reconcile must not re-Update the Service")

			policy := &networkingv1.NetworkPolicy{}
			Expect(k8sClient.Get(ctx, types.NamespacedName{Name: names.Runner, Namespace: "default"}, policy)).To(Succeed())
			serviceAccount := &corev1.ServiceAccount{}
			Expect(k8sClient.Get(ctx, types.NamespacedName{Name: names.Runner, Namespace: "default"}, serviceAccount)).To(Succeed())

			// A provisioned runner is not a callable tool: nothing fronts it yet.
			updatedTool := &arkv1alpha1.Tool{}
			Expect(k8sClient.Get(ctx, typeNamespacedName, updatedTool)).To(Succeed())
			Expect(updatedTool.Status.State).To(Equal(arkv1alpha1.ToolStatePending))
			Expect(updatedTool.Status.ResolvedAddress).To(BeEmpty())
		})
	})

	Context("When an owned child's spec drifts out of band", func() {
		const resourceName = "inline-drift"

		It("restores the whole managed Service spec", func() {
			GinkgoT().Setenv(inlinetools.EnabledEnvVar, "true")
			GinkgoT().Setenv(runner.EnvImageRepository, "ghcr.io/example/ark-inline-runner")
			GinkgoT().Setenv(runner.EnvImageTag, "v1.2.3")

			ctx := context.Background()
			toolKey := types.NamespacedName{Name: resourceName, Namespace: "default"}
			serviceKey := types.NamespacedName{Name: inlineChildNames(resourceName).Runner, Namespace: "default"}

			tool := &arkv1alpha1.Tool{
				ObjectMeta: metav1.ObjectMeta{Name: resourceName, Namespace: "default"},
				Spec: arkv1alpha1.ToolSpec{
					Type:   arkv1alpha1.ToolTypeInline,
					Inline: &arkv1alpha1.InlineSpec{Source: "print(1)", Language: arkv1alpha1.InlineLanguagePython},
				},
			}
			Expect(k8sClient.Create(ctx, tool)).To(Succeed())
			DeferCleanup(func() {
				Expect(client.IgnoreNotFound(k8sClient.Delete(context.Background(), tool))).To(Succeed())
			})

			controllerReconciler := &ToolReconciler{Client: k8sClient, Scheme: k8sClient.Scheme()}
			_, err := controllerReconciler.Reconcile(ctx, reconcile.Request{NamespacedName: toolKey})
			Expect(err).NotTo(HaveOccurred())

			drifted := &corev1.Service{}
			Expect(k8sClient.Get(ctx, serviceKey, drifted)).To(Succeed())
			drifted.Spec.Selector = map[string]string{"hijacked": "true"}
			drifted.Spec.Ports = []corev1.ServicePort{{Name: "wrong", Port: 1, Protocol: corev1.ProtocolTCP}}
			Expect(k8sClient.Update(ctx, drifted)).To(Succeed())

			_, err = controllerReconciler.Reconcile(ctx, reconcile.Request{NamespacedName: toolKey})
			Expect(err).NotTo(HaveOccurred())

			// Comparing the whole spec, with only the API-server-assigned fields
			// masked out, covers any field inlineService gains later; a
			// field-by-field assertion would not.
			Expect(k8sClient.Get(ctx, toolKey, tool)).To(Succeed())
			want := inlineService(tool).Spec
			restored := &corev1.Service{}
			Expect(k8sClient.Get(ctx, serviceKey, restored)).To(Succeed())
			got := *restored.Spec.DeepCopy()
			got.ClusterIP, got.ClusterIPs = "", nil
			got.IPFamilies, got.IPFamilyPolicy = nil, nil
			Expect(got).To(Equal(want), "a drifted Service must be reconciled back to the full desired spec")
		})
	})

	Context("When the child Service's defaulted policy fields drift out of band", func() {
		const resourceName = "inline-affinity-drift"

		It("resets them and settles without re-Updating the Service", func() {
			GinkgoT().Setenv(inlinetools.EnabledEnvVar, "true")
			GinkgoT().Setenv(runner.EnvImageRepository, "ghcr.io/example/ark-inline-runner")
			GinkgoT().Setenv(runner.EnvImageTag, "v1.2.3")

			ctx := context.Background()
			toolKey := types.NamespacedName{Name: resourceName, Namespace: "default"}
			serviceKey := types.NamespacedName{Name: inlineChildNames(resourceName).Runner, Namespace: "default"}

			tool := &arkv1alpha1.Tool{
				ObjectMeta: metav1.ObjectMeta{Name: resourceName, Namespace: "default"},
				Spec: arkv1alpha1.ToolSpec{
					Type:   arkv1alpha1.ToolTypeInline,
					Inline: &arkv1alpha1.InlineSpec{Source: "print(1)", Language: arkv1alpha1.InlineLanguagePython},
				},
			}
			Expect(k8sClient.Create(ctx, tool)).To(Succeed())
			DeferCleanup(func() {
				Expect(client.IgnoreNotFound(k8sClient.Delete(context.Background(), tool))).To(Succeed())
			})

			serviceUpdates := 0
			counting := &serviceUpdateCounter{Client: k8sClient, updates: &serviceUpdates}
			controllerReconciler := &ToolReconciler{Client: counting, Scheme: k8sClient.Scheme()}
			_, err := controllerReconciler.Reconcile(ctx, reconcile.Request{NamespacedName: toolKey})
			Expect(err).NotTo(HaveOccurred())

			drifted := &corev1.Service{}
			Expect(k8sClient.Get(ctx, serviceKey, drifted)).To(Succeed())
			drifted.Spec.SessionAffinity = corev1.ServiceAffinityClientIP
			drifted.Spec.InternalTrafficPolicy = ptr.To(corev1.ServiceInternalTrafficPolicyLocal)
			Expect(k8sClient.Update(ctx, drifted)).To(Succeed())

			// The API server defaults SessionAffinityConfig alongside ClientIP, and the
			// desired spec leaves it nil. Carrying the drifted affinity forward would
			// therefore leave a permanent diff and an Update on every reconcile.
			Expect(k8sClient.Get(ctx, serviceKey, drifted)).To(Succeed())
			Expect(drifted.Spec.SessionAffinityConfig).NotTo(BeNil())

			_, err = controllerReconciler.Reconcile(ctx, reconcile.Request{NamespacedName: toolKey})
			Expect(err).NotTo(HaveOccurred())

			corrected := &corev1.Service{}
			Expect(k8sClient.Get(ctx, serviceKey, corrected)).To(Succeed())
			Expect(corrected.Spec.SessionAffinity).To(Equal(corev1.ServiceAffinityNone))
			Expect(corrected.Spec.InternalTrafficPolicy).To(HaveValue(Equal(corev1.ServiceInternalTrafficPolicyCluster)))

			serviceUpdates = 0
			for range 2 {
				_, err = controllerReconciler.Reconcile(ctx, reconcile.Request{NamespacedName: toolKey})
				Expect(err).NotTo(HaveOccurred())
			}
			Expect(serviceUpdates).To(Equal(0), "a corrected Service must not be re-Updated on later reconciles")
		})
	})

	Context("When an owned child is deleted out of band", func() {
		const resourceName = "inline-owned-watch"

		It("recreates the ServiceAccount from its own watch, with no other trigger", func() {
			GinkgoT().Setenv(inlinetools.EnabledEnvVar, "true")
			GinkgoT().Setenv(runner.EnvImageRepository, "ghcr.io/example/ark-inline-runner")
			GinkgoT().Setenv(runner.EnvImageTag, "v1.2.3")

			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()

			mgr, err := ctrl.NewManager(cfg, ctrl.Options{
				Scheme:  scheme.Scheme,
				Metrics: metricsserver.Options{BindAddress: "0"},
			})
			Expect(err).NotTo(HaveOccurred())
			Expect((&ToolReconciler{Client: mgr.GetClient(), Scheme: mgr.GetScheme()}).SetupWithManager(mgr)).To(Succeed())

			go func() {
				defer GinkgoRecover()
				Expect(mgr.Start(ctx)).To(Succeed())
			}()
			Expect(mgr.GetCache().WaitForCacheSync(ctx)).To(BeTrue())

			tool := &arkv1alpha1.Tool{
				ObjectMeta: metav1.ObjectMeta{Name: resourceName, Namespace: "default"},
				Spec: arkv1alpha1.ToolSpec{
					Type:   arkv1alpha1.ToolTypeInline,
					Inline: &arkv1alpha1.InlineSpec{Source: "print(1)", Language: arkv1alpha1.InlineLanguagePython},
				},
			}
			Expect(k8sClient.Create(ctx, tool)).To(Succeed())
			DeferCleanup(func() {
				Expect(client.IgnoreNotFound(k8sClient.Delete(context.Background(), tool))).To(Succeed())
			})

			serviceAccountKey := types.NamespacedName{Name: inlineChildNames(resourceName).Runner, Namespace: "default"}
			serviceAccount := &corev1.ServiceAccount{}
			Eventually(func() error {
				return k8sClient.Get(ctx, serviceAccountKey, serviceAccount)
			}, 10*time.Second).Should(Succeed(), "the first reconcile should provision the runner ServiceAccount")
			originalUID := serviceAccount.UID

			// The Tool must be settled before the delete, so that the recreation
			// below can only have come from the ServiceAccount watch: a status write
			// still in flight would itself queue another Tool reconcile.
			Eventually(func(g Gomega) {
				settling := &arkv1alpha1.Tool{}
				g.Expect(k8sClient.Get(ctx, client.ObjectKeyFromObject(tool), settling)).To(Succeed())
				condition := meta.FindStatusCondition(settling.Status.Conditions, arkv1alpha1.ToolConditionAvailable)
				g.Expect(condition).NotTo(BeNil())
				g.Expect(condition.ObservedGeneration).To(Equal(settling.Generation))
			}, 10*time.Second).Should(Succeed())
			Consistently(func(g Gomega) {
				g.Expect(k8sClient.Get(ctx, serviceAccountKey, serviceAccount)).To(Succeed())
				g.Expect(serviceAccount.UID).To(Equal(originalUID))
			}, 2*time.Second, 200*time.Millisecond).Should(Succeed())

			Expect(k8sClient.Delete(ctx, serviceAccount)).To(Succeed())

			Eventually(func(g Gomega) types.UID {
				recreated := &corev1.ServiceAccount{}
				g.Expect(k8sClient.Get(ctx, serviceAccountKey, recreated)).To(Succeed())
				g.Expect(recreated.AutomountServiceAccountToken).NotTo(BeNil())
				g.Expect(*recreated.AutomountServiceAccountToken).To(BeFalse())
				return recreated.UID
			}, 15*time.Second).ShouldNot(Equal(originalUID),
				"deleting the ServiceAccount must trigger the Tool's own watch and recreate it")
		})
	})
})

// serviceUpdateCounter counts Update calls for Services, so a test can assert a
// steady-state reconcile issues none.
type serviceUpdateCounter struct {
	client.Client
	updates *int
}

func (c *serviceUpdateCounter) Update(ctx context.Context, obj client.Object, opts ...client.UpdateOption) error {
	if _, ok := obj.(*corev1.Service); ok {
		*c.updates++
	}
	return c.Client.Update(ctx, obj, opts...)
}
