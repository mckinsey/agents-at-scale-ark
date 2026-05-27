/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"time"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/types"
	ctrl "sigs.k8s.io/controller-runtime"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arka2a "mckinsey.com/ark/internal/a2a"
)

var _ = Describe("A2ATask Controller", func() {
	Context("When reconciling an A2ATask resource", func() {
		const resourceName = "test-a2atask"

		ctx := context.Background()

		typeNamespacedName := types.NamespacedName{
			Name:      resourceName,
			Namespace: "default",
		}
		a2aTask := &arkv1alpha1.A2ATask{}

		BeforeEach(func() {
			By("creating the A2ATask resource")
			err := k8sClient.Get(ctx, typeNamespacedName, a2aTask)
			if err != nil && errors.IsNotFound(err) {
				resource := &arkv1alpha1.A2ATask{
					ObjectMeta: metav1.ObjectMeta{
						Name:      resourceName,
						Namespace: "default",
					},
					Spec: arkv1alpha1.A2ATaskSpec{
						TaskID: "test-task-123",
						QueryRef: arkv1alpha1.QueryRef{
							Name: "test-query",
						},
						AgentRef: arkv1alpha1.AgentRef{
							Name: "test-agent",
						},
					},
				}
				Expect(k8sClient.Create(ctx, resource)).To(Succeed())
			}
		})

		AfterEach(func() {
			By("Cleanup the A2ATask resource")
			resource := &arkv1alpha1.A2ATask{}
			err := k8sClient.Get(ctx, typeNamespacedName, resource)
			Expect(err).NotTo(HaveOccurred())

			Expect(k8sClient.Delete(ctx, resource)).To(Succeed())
		})

		It("should successfully reconcile the resource", func() {
			By("Reconciling the created resource")
			controllerReconciler := &A2ATaskReconciler{
				Client: k8sClient,
				Scheme: k8sClient.Scheme(),
			}

			_, err := controllerReconciler.Reconcile(ctx, ctrl.Request{
				NamespacedName: typeNamespacedName,
			})
			Expect(err).NotTo(HaveOccurred())
		})

		It("should handle approval timeout for input-required phase", func() {
			By("Creating an A2ATask in input-required phase with expired timeout")
			taskName := "test-approval-timeout"
			expiredTime := metav1.NewTime(time.Now().Add(-10 * time.Minute))

			task := &arkv1alpha1.A2ATask{
				ObjectMeta: metav1.ObjectMeta{
					Name:      taskName,
					Namespace: "default",
				},
				Spec: arkv1alpha1.A2ATaskSpec{
					TaskID: "timeout-task-456",
					QueryRef: arkv1alpha1.QueryRef{
						Name: "test-query",
					},
					AgentRef: arkv1alpha1.AgentRef{
						Name: "test-agent",
					},
				},
				Status: arkv1alpha1.A2ATaskStatus{
					Phase: arka2a.PhaseInputRequired,
					ProtocolMetadata: map[string]string{
						"requestedInputAt": expiredTime.Format(time.RFC3339),
						"timeout":          "5m",
						"onTimeout":        "reject",
					},
				},
			}
			Expect(k8sClient.Create(ctx, task)).To(Succeed())

			// Update status separately (status is a subresource in K8s)
			task.Status.Phase = arka2a.PhaseInputRequired
			task.Status.ProtocolMetadata = map[string]string{
				"requestedInputAt": expiredTime.Format(time.RFC3339),
				"timeout":          "5m",
				"onTimeout":        "reject",
			}
			task.Status.StartTime = &expiredTime
			task.Status.Conditions = []metav1.Condition{
				{
					Type:               string(arkv1alpha1.A2ATaskCompleted),
					Status:             metav1.ConditionFalse,
					Reason:             "TaskRunning",
					Message:            "Task is running",
					LastTransitionTime: metav1.Now(),
					ObservedGeneration: task.Generation,
				},
			}
			Expect(k8sClient.Status().Update(ctx, task)).To(Succeed())

			By("Reconciling to handle the timeout")
			controllerReconciler := &A2ATaskReconciler{
				Client: k8sClient,
				Scheme: k8sClient.Scheme(),
			}

			_, err := controllerReconciler.Reconcile(ctx, ctrl.Request{
				NamespacedName: types.NamespacedName{
					Name:      taskName,
					Namespace: "default",
				},
			})
			Expect(err).NotTo(HaveOccurred())

			By("Verifying the task was moved to failed phase")
			updatedTask := &arkv1alpha1.A2ATask{}
			Expect(k8sClient.Get(ctx, types.NamespacedName{Name: taskName, Namespace: "default"}, updatedTask)).To(Succeed())
			Expect(updatedTask.Status.Phase).To(Equal(arka2a.PhaseFailed))

			// Cleanup
			Expect(k8sClient.Delete(ctx, task)).To(Succeed())
		})

		It("should handle input submission and transition to completed", func() {
			By("Creating an A2ATask in input-required phase")
			taskName := "test-input-submission"

			task := &arkv1alpha1.A2ATask{
				ObjectMeta: metav1.ObjectMeta{
					Name:      taskName,
					Namespace: "default",
				},
				Spec: arkv1alpha1.A2ATaskSpec{
					TaskID: "input-task-789",
					QueryRef: arkv1alpha1.QueryRef{
						Name: "test-query",
					},
					AgentRef: arkv1alpha1.AgentRef{
						Name: "test-agent",
					},
					Input: `{"decision": "approved"}`,
				},
				Status: arkv1alpha1.A2ATaskStatus{
					Phase: arka2a.PhaseInputRequired,
				},
			}
			Expect(k8sClient.Create(ctx, task)).To(Succeed())

			// Update status separately (status is a subresource in K8s)
			startTime := metav1.Now()
			task.Status.Phase = arka2a.PhaseInputRequired
			task.Status.StartTime = &startTime
			task.Status.Conditions = []metav1.Condition{
				{
					Type:               string(arkv1alpha1.A2ATaskCompleted),
					Status:             metav1.ConditionFalse,
					Reason:             "TaskRunning",
					Message:            "Task is running",
					LastTransitionTime: metav1.Now(),
					ObservedGeneration: task.Generation,
				},
			}
			Expect(k8sClient.Status().Update(ctx, task)).To(Succeed())

			By("Reconciling to handle the input")
			controllerReconciler := &A2ATaskReconciler{
				Client: k8sClient,
				Scheme: k8sClient.Scheme(),
			}

			_, err := controllerReconciler.Reconcile(ctx, ctrl.Request{
				NamespacedName: types.NamespacedName{
					Name:      taskName,
					Namespace: "default",
				},
			})
			Expect(err).NotTo(HaveOccurred())

			By("Verifying the task was moved to completed phase")
			updatedTask := &arkv1alpha1.A2ATask{}
			Expect(k8sClient.Get(ctx, types.NamespacedName{Name: taskName, Namespace: "default"}, updatedTask)).To(Succeed())
			Expect(updatedTask.Status.Phase).To(Equal(arka2a.PhaseCompleted))

			// Cleanup
			Expect(k8sClient.Delete(ctx, task)).To(Succeed())
		})
	})
})
