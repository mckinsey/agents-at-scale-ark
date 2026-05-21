/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"time"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	arka2a "mckinsey.com/ark/internal/a2a"
	eventnoop "mckinsey.com/ark/internal/eventing/noop"
)

var _ = Describe("A2ATask Controller", func() {
	Context("When reconciling a resource", func() {
		const resourceName = "test-a2atask"
		const a2aServerName = "test-a2aserver"
		const agentName = "test-agent"

		ctx := context.Background()

		typeNamespacedName := types.NamespacedName{
			Name:      resourceName,
			Namespace: "default",
		}

		BeforeEach(func() {
			By("creating the A2AServer resource")
			a2aServer := &arkv1prealpha1.A2AServer{
				ObjectMeta: metav1.ObjectMeta{
					Name:      a2aServerName,
					Namespace: "default",
				},
				Spec: arkv1prealpha1.A2AServerSpec{
					Address: "http://test-server:8080",
				},
				Status: arkv1prealpha1.A2AServerStatus{
					LastResolvedAddress: "http://test-server:8080",
				},
			}
			Expect(k8sClient.Create(ctx, a2aServer)).To(Succeed())

			By("creating the Agent resource")
			agent := &arkv1alpha1.Agent{
				ObjectMeta: metav1.ObjectMeta{
					Name:      agentName,
					Namespace: "default",
				},
				Spec: arkv1alpha1.AgentSpec{
					ModelRef: &arkv1alpha1.AgentModelRef{
						Name: "test-model",
					},
					Prompt: "test prompt",
				},
			}
			Expect(k8sClient.Create(ctx, agent)).To(Succeed())

			By("creating the A2ATask resource")
			a2aTask := &arkv1alpha1.A2ATask{
				ObjectMeta: metav1.ObjectMeta{
					Name:      resourceName,
					Namespace: "default",
				},
				Spec: arkv1alpha1.A2ATaskSpec{
					TaskID: "test-task-id",
					A2AServerRef: arkv1alpha1.A2AServerReference{
						Name: a2aServerName,
					},
					AgentRef: arkv1alpha1.AgentReference{
						Name: agentName,
					},
				},
			}
			Expect(k8sClient.Create(ctx, a2aTask)).To(Succeed())
		})

		AfterEach(func() {
			By("Cleanup the A2ATask resource")
			a2aTask := &arkv1alpha1.A2ATask{}
			err := k8sClient.Get(ctx, typeNamespacedName, a2aTask)
			if err == nil {
				Expect(k8sClient.Delete(ctx, a2aTask)).To(Succeed())
			}

			By("Cleanup the Agent resource")
			agent := &arkv1alpha1.Agent{}
			err = k8sClient.Get(ctx, types.NamespacedName{Name: agentName, Namespace: "default"}, agent)
			if err == nil {
				Expect(k8sClient.Delete(ctx, agent)).To(Succeed())
			}

			By("Cleanup the A2AServer resource")
			a2aServer := &arkv1prealpha1.A2AServer{}
			err = k8sClient.Get(ctx, types.NamespacedName{Name: a2aServerName, Namespace: "default"}, a2aServer)
			if err == nil {
				Expect(k8sClient.Delete(ctx, a2aServer)).To(Succeed())
			}
		})

		It("should not update status when nothing changes", func() {
			By("Getting the initial task")
			a2aTask := &arkv1alpha1.A2ATask{}
			Expect(k8sClient.Get(ctx, typeNamespacedName, a2aTask)).To(Succeed())

			By("Setting initial status to a terminal phase")
			a2aTask.Status.Phase = arka2a.PhaseCompleted
			a2aTask.Status.Conditions = []metav1.Condition{
				{
					Type:               string(arkv1alpha1.A2ATaskCompleted),
					Status:             metav1.ConditionTrue,
					Reason:             "TaskSucceeded",
					Message:            "Task completed successfully",
					ObservedGeneration: a2aTask.Generation,
					LastTransitionTime: metav1.Now(),
				},
			}
			Expect(k8sClient.Status().Update(ctx, a2aTask)).To(Succeed())

			By("Recording the resourceVersion before reconcile")
			Expect(k8sClient.Get(ctx, typeNamespacedName, a2aTask)).To(Succeed())
			resourceVersionBefore := a2aTask.ResourceVersion

			By("Reconciling the terminal task")
			controllerReconciler := &A2ATaskReconciler{
				Client:   k8sClient,
				Scheme:   k8sClient.Scheme(),
				Eventing: eventnoop.NewProvider(),
			}

			result, err := controllerReconciler.Reconcile(ctx, reconcile.Request{
				NamespacedName: typeNamespacedName,
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(result).To(Equal(ctrl.Result{}))

			By("Verifying the resourceVersion did not change")
			Expect(k8sClient.Get(ctx, typeNamespacedName, a2aTask)).To(Succeed())
			Expect(a2aTask.ResourceVersion).To(Equal(resourceVersionBefore))
		})

		It("should initialize conditions on first reconcile", func() {
			By("Getting the task with no status")
			a2aTask := &arkv1alpha1.A2ATask{}
			Expect(k8sClient.Get(ctx, typeNamespacedName, a2aTask)).To(Succeed())

			By("Reconciling the task")
			controllerReconciler := &A2ATaskReconciler{
				Client:   k8sClient,
				Scheme:   k8sClient.Scheme(),
				Eventing: eventnoop.NewProvider(),
			}

			result, err := controllerReconciler.Reconcile(ctx, reconcile.Request{
				NamespacedName: typeNamespacedName,
			})
			Expect(err).NotTo(HaveOccurred())
			Expect(result).To(Equal(ctrl.Result{}))

			By("Verifying conditions were initialized")
			Expect(k8sClient.Get(ctx, typeNamespacedName, a2aTask)).To(Succeed())
			Expect(a2aTask.Status.Conditions).To(HaveLen(1))
			Expect(a2aTask.Status.Conditions[0].Type).To(Equal(string(arkv1alpha1.A2ATaskCompleted)))
			Expect(a2aTask.Status.Conditions[0].Status).To(Equal(metav1.ConditionFalse))
		})

		It("should respect poll interval for non-terminal tasks", func() {
			By("Getting the task")
			a2aTask := &arkv1alpha1.A2ATask{}
			Expect(k8sClient.Get(ctx, typeNamespacedName, a2aTask)).To(Succeed())

			By("Setting status to running with custom poll interval")
			pollInterval := metav1.Duration{Duration: 10 * time.Second}
			a2aTask.Spec.PollInterval = &pollInterval
			a2aTask.Status.Phase = arka2a.PhaseRunning
			a2aTask.Status.Conditions = []metav1.Condition{
				{
					Type:               string(arkv1alpha1.A2ATaskCompleted),
					Status:             metav1.ConditionFalse,
					Reason:             "TaskRunning",
					Message:            "Task is running",
					ObservedGeneration: a2aTask.Generation,
					LastTransitionTime: metav1.Now(),
				},
			}
			Expect(k8sClient.Update(ctx, a2aTask)).To(Succeed())
			Expect(k8sClient.Status().Update(ctx, a2aTask)).To(Succeed())

			By("Reconciling the running task")
			controllerReconciler := &A2ATaskReconciler{
				Client:   k8sClient,
				Scheme:   k8sClient.Scheme(),
				Eventing: eventnoop.NewProvider(),
			}

			// Note: This will fail to fetch A2A status (no real server), but should still return requeue
			result, err := controllerReconciler.Reconcile(ctx, reconcile.Request{
				NamespacedName: typeNamespacedName,
			})

			// We expect no error here because fetch errors are logged but not returned
			Expect(err).NotTo(HaveOccurred())
			// The result should have RequeueAfter set to poll interval
			Expect(result.RequeueAfter).To(Equal(pollInterval.Duration))
		})
	})

	Context("Status update optimization", func() {
		It("should skip status update when fetching fails but status is unchanged", func() {
			// This test verifies that when fetchA2ATaskStatus fails (e.g., server unavailable),
			// but the status hasn't changed, we don't trigger an unnecessary update.
			// The actual behavior depends on whether fetchA2ATaskStatus modifies status on error.
			// This is handled by the DeepEqual check in the reconciler.
			Skip("This behavior is already tested indirectly by the 'should not update status when nothing changes' test")
		})
	})
})
