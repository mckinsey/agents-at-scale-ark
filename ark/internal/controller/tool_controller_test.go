/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
	"k8s.io/apimachinery/pkg/types"
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
})
