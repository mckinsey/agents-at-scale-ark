/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"fmt"
	"time"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/types"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/annotations"
)

var _ = Describe("Query Controller", func() {
	Context("When reconciling a resource", func() {
		const resourceName = "test-resource"

		ctx := context.Background()

		typeNamespacedName := types.NamespacedName{
			Name:      resourceName,
			Namespace: "default", // TODO(user):Modify as needed
		}
		query := &arkv1alpha1.Query{}

		BeforeEach(func() {
			By("creating the custom resource for the Kind Query")
			err := k8sClient.Get(ctx, typeNamespacedName, query)
			if err != nil && errors.IsNotFound(err) {
				resource := &arkv1alpha1.Query{
					ObjectMeta: metav1.ObjectMeta{
						Name:      resourceName,
						Namespace: "default",
					},
					Spec: arkv1alpha1.QuerySpec{
						Target: &arkv1alpha1.QueryTarget{
							Type: "agent",
							Name: "test-agent",
						},
					},
				}

				// Set input using RawExtension helper
				err := resource.Spec.SetInputString("test input question")
				Expect(err).ShouldNot(HaveOccurred())

				Expect(k8sClient.Create(ctx, resource)).To(Succeed())
			}
		})

		AfterEach(func() {
			// TODO(user): Cleanup logic after each test, like removing the resource instance.
			resource := &arkv1alpha1.Query{}
			err := k8sClient.Get(ctx, typeNamespacedName, resource)
			Expect(err).NotTo(HaveOccurred())

			By("Cleanup the specific resource instance Query")
			Expect(k8sClient.Delete(ctx, resource)).To(Succeed())
		})
		It("should successfully reconcile the resource", func() {
			By("Reconciling the created resource")
			controllerReconciler := &QueryReconciler{
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
	Context("When setting status.conditions", func() {
		It("Should initialize conditions when query is created", func() {
			ctx := context.Background()

			// Create query
			query := &arkv1alpha1.Query{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-query-conditions",
					Namespace: "default",
				},
				Spec: arkv1alpha1.QuerySpec{
					Target: &arkv1alpha1.QueryTarget{
						Type: "agent",
						Name: "test-agent",
					},
				},
			}

			// Set input using RawExtension helper
			err := query.Spec.SetInputString("test input question")
			Expect(err).ShouldNot(HaveOccurred())

			Expect(k8sClient.Create(ctx, query)).Should(Succeed())

			queryLookupKey := types.NamespacedName{Name: "test-query-conditions", Namespace: "default"}

			controllerReconciler := &QueryReconciler{
				Client: k8sClient,
				Scheme: k8sClient.Scheme(),
			}

			// First reconcile
			_, err = controllerReconciler.Reconcile(ctx, ctrl.Request{
				NamespacedName: queryLookupKey,
			})
			Expect(err).NotTo(HaveOccurred())

			// Second reconcile should set status.conditions to QueryNotStarted
			_, err = controllerReconciler.Reconcile(ctx, ctrl.Request{
				NamespacedName: queryLookupKey,
			})
			Expect(err).NotTo(HaveOccurred())

			// Verify conditions were initialized
			createdQuery := &arkv1alpha1.Query{}
			Expect(k8sClient.Get(ctx, queryLookupKey, createdQuery)).Should(Succeed())

			Expect(createdQuery.Status.Conditions).To(HaveLen(1))
			condition := createdQuery.Status.Conditions[0]
			Expect(condition.Type).To(Equal(string(arkv1alpha1.QueryCompleted)))
			Expect(condition.Status).To(Equal(metav1.ConditionFalse))
			Expect(condition.Reason).To(Equal("QueryNotStarted"))
			Expect(condition.Message).To(Equal("The query has not been started yet"))
			Expect(condition.ObservedGeneration).To(Equal(createdQuery.Generation))

			// Cleanup
			Expect(k8sClient.Delete(ctx, createdQuery)).Should(Succeed())
		})

		It("Should update conditions when query status changes", func() {
			ctx := context.Background()

			// Create query
			query := &arkv1alpha1.Query{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "test-query-conditions-2",
					Namespace: "default",
				},
				Spec: arkv1alpha1.QuerySpec{
					Target: &arkv1alpha1.QueryTarget{
						Type: "agent",
						Name: "test-agent",
					},
				},
			}

			// Set input using RawExtension helper
			err := query.Spec.SetInputString("test input question")
			Expect(err).ShouldNot(HaveOccurred())

			Expect(k8sClient.Create(ctx, query)).Should(Succeed())

			queryLookupKey := types.NamespacedName{Name: "test-query-conditions-2", Namespace: "default"}

			controllerReconciler := &QueryReconciler{
				Client: k8sClient,
				Scheme: k8sClient.Scheme(),
			}

			// First reconcile
			_, err = controllerReconciler.Reconcile(ctx, ctrl.Request{
				NamespacedName: queryLookupKey,
			})
			Expect(err).NotTo(HaveOccurred())

			// Second reconcile should set status.conditions to QueryNotStarted
			_, err = controllerReconciler.Reconcile(ctx, ctrl.Request{
				NamespacedName: queryLookupKey,
			})
			Expect(err).NotTo(HaveOccurred())

			// Third reconcile should set status.conditions to QueryRunning
			_, err = controllerReconciler.Reconcile(ctx, ctrl.Request{
				NamespacedName: queryLookupKey,
			})
			Expect(err).NotTo(HaveOccurred())

			// Verify conditions were initialized
			createdQuery := &arkv1alpha1.Query{}
			Expect(k8sClient.Get(ctx, queryLookupKey, createdQuery)).Should(Succeed())

			// Verify conditions were updated for running state
			Expect(k8sClient.Get(ctx, queryLookupKey, createdQuery)).Should(Succeed())

			Expect(createdQuery.Status.Conditions).To(HaveLen(1))
			condition := createdQuery.Status.Conditions[0]
			Expect(condition.Type).To(Equal(string(arkv1alpha1.QueryCompleted)))
			Expect(condition.Status).To(Equal(metav1.ConditionFalse))
			Expect(condition.Reason).To(Equal("QueryRunning"))
			Expect(condition.Message).To(Equal("Query is running"))
			Expect(condition.ObservedGeneration).To(Equal(createdQuery.Generation))

			// Cleanup
			Expect(k8sClient.Delete(ctx, createdQuery)).Should(Succeed())
		})
	})

	Context("When updating status of a deleted query", func() {
		ctx := context.Background()

		It("should not error", func() {
			const deletedQueryName = "test-deleted-status-query"

			deletedQuery := &arkv1alpha1.Query{
				ObjectMeta: metav1.ObjectMeta{
					Name:      deletedQueryName,
					Namespace: "default",
				},
				Spec: arkv1alpha1.QuerySpec{
					Target: &arkv1alpha1.QueryTarget{Type: "agent", Name: "test-agent"},
				},
			}
			Expect(deletedQuery.Spec.SetInputString("hello")).To(Succeed())
			Expect(k8sClient.Create(ctx, deletedQuery)).To(Succeed())

			controllerReconciler := &QueryReconciler{
				Client: k8sClient,
				Scheme: k8sClient.Scheme(),
			}

			By("reconciling to initialize status")
			_, err := controllerReconciler.Reconcile(ctx, reconcile.Request{
				NamespacedName: types.NamespacedName{Name: deletedQueryName, Namespace: "default"},
			})
			Expect(err).NotTo(HaveOccurred())

			By("deleting the query")
			Expect(k8sClient.Get(ctx, types.NamespacedName{Name: deletedQueryName, Namespace: "default"}, deletedQuery)).To(Succeed())
			Expect(k8sClient.Delete(ctx, deletedQuery)).To(Succeed())

			By("reconciling with deletionTimestamp to remove finalizer and fully delete")
			_, err = controllerReconciler.Reconcile(ctx, reconcile.Request{
				NamespacedName: types.NamespacedName{Name: deletedQueryName, Namespace: "default"},
			})
			Expect(err).NotTo(HaveOccurred())

			By("calling updateStatus on the deleted query should not error")
			Expect(controllerReconciler.updateStatus(ctx, deletedQuery, "Running")).To(Succeed())
		})
	})
})

var _ = Describe("Query Controller handleRunningPhase", func() {
	Context("TTL handling", func() {
		It("returns immediately when the query TTL has already expired", func() {
			r := &QueryReconciler{
				Client: k8sClient,
				Scheme: k8sClient.Scheme(),
			}
			query := arkv1alpha1.Query{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "expired-ttl-query",
					Namespace: "default",
					CreationTimestamp: metav1.Time{
						Time: time.Now().Add(-2 * time.Hour),
					},
				},
				Spec: arkv1alpha1.QuerySpec{
					TTL: &metav1.Duration{Duration: 1 * time.Hour},
				},
			}
			req := ctrl.Request{NamespacedName: types.NamespacedName{Name: query.Name, Namespace: query.Namespace}}

			result, err := r.handleRunningPhase(context.Background(), req, query)

			Expect(err).NotTo(HaveOccurred())
			Expect(result).To(Equal(ctrl.Result{}))
		})

		It("returns immediately when the query has no TTL and uses default 1h but is already 2h old", func() {
			r := &QueryReconciler{
				Client: k8sClient,
				Scheme: k8sClient.Scheme(),
			}
			query := arkv1alpha1.Query{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "no-ttl-old-query",
					Namespace: "default",
					CreationTimestamp: metav1.Time{
						Time: time.Now().Add(-2 * time.Hour),
					},
				},
			}
			req := ctrl.Request{NamespacedName: types.NamespacedName{Name: query.Name, Namespace: query.Namespace}}

			result, err := r.handleRunningPhase(context.Background(), req, query)

			Expect(err).NotTo(HaveOccurred())
			Expect(result).To(Equal(ctrl.Result{}))
		})
	})
})

var _ = Describe("Query Controller Fallback Raw", func() {
	Context("When building fallback raw JSON", func() {
		It("should produce assistant message JSON", func() {
			jsonStr := buildFallbackRaw("hello")
			Expect(jsonStr).To(ContainSubstring(`"role":"assistant"`))
			Expect(jsonStr).To(ContainSubstring(`"content":"hello"`))
		})

		It("should handle empty text", func() {
			jsonStr := buildFallbackRaw("")
			Expect(jsonStr).To(ContainSubstring(`"role":"assistant"`))
			Expect(jsonStr).To(ContainSubstring(`"content":""`))
		})
	})
})

var _ = Describe("Query Controller handleInputRequiredPhase", func() {
	const queryName = "hitl-test-query"
	const taskID = "approval-task-123"
	taskName := "a2a-task-" + taskID

	cleanup := func(ctx context.Context) {
		_ = k8sClient.Delete(ctx, &arkv1alpha1.A2ATask{ObjectMeta: metav1.ObjectMeta{Name: taskName, Namespace: "default"}})
		_ = k8sClient.Delete(ctx, &arkv1alpha1.Query{ObjectMeta: metav1.ObjectMeta{Name: queryName, Namespace: "default"}})
	}

	createQueryAwaitingApproval := func(ctx context.Context) *arkv1alpha1.Query {
		query := &arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{
				Name:      queryName,
				Namespace: "default",
			},
			Spec: arkv1alpha1.QuerySpec{
				Target: &arkv1alpha1.QueryTarget{Type: "agent", Name: "test-agent"},
			},
		}
		Expect(query.Spec.SetInputString("trigger")).To(Succeed())
		Expect(k8sClient.Create(ctx, query)).To(Succeed())

		query.Status.Phase = statusInputRequired
		query.Status.Response = &arkv1alpha1.Response{
			Target: *query.Spec.Target,
			A2A: &arkv1alpha1.A2AMetadata{
				TaskID: taskID,
			},
		}
		Expect(k8sClient.Status().Update(ctx, query)).To(Succeed())
		return query
	}

	It("resumes execution when approval timed out (treated as resumable denial)", func() {
		ctx := context.Background()
		defer cleanup(ctx)
		query := createQueryAwaitingApproval(ctx)

		task := &arkv1alpha1.A2ATask{
			ObjectMeta: metav1.ObjectMeta{
				Name:      taskName,
				Namespace: "default",
			},
			Spec: arkv1alpha1.A2ATaskSpec{
				TaskID:   taskID,
				QueryRef: arkv1alpha1.QueryRef{Name: queryName, Namespace: "default"},
				AgentRef: arkv1alpha1.AgentRef{Name: "test-agent"},
			},
		}
		Expect(k8sClient.Create(ctx, task)).To(Succeed())
		task.Status = arkv1alpha1.A2ATaskStatus{
			Phase: "failed",
			Error: "Approval timeout exceeded after 5m",
			Conditions: []metav1.Condition{{
				Type:               string(arkv1alpha1.A2ATaskCompleted),
				Status:             metav1.ConditionTrue,
				Reason:             "ApprovalTimeoutRejected",
				Message:            "Approval timeout exceeded",
				LastTransitionTime: metav1.Now(),
			}},
		}
		Expect(k8sClient.Status().Update(ctx, task)).To(Succeed())

		r := &QueryReconciler{Client: k8sClient, Scheme: k8sClient.Scheme()}
		_, err := r.handleInputRequiredPhase(ctx, query, time.Now().Add(time.Hour))
		Expect(err).NotTo(HaveOccurred())

		// Query should be running (not error) so the executor can resume
		updated := &arkv1alpha1.Query{}
		Expect(k8sClient.Get(ctx, types.NamespacedName{Name: queryName, Namespace: "default"}, updated)).To(Succeed())
		Expect(updated.Status.Phase).To(Equal(statusRunning))
	})

	It("propagates A2ATask error into Response.Content when a true failure occurs", func() {
		ctx := context.Background()
		defer cleanup(ctx)
		query := createQueryAwaitingApproval(ctx)

		task := &arkv1alpha1.A2ATask{
			ObjectMeta: metav1.ObjectMeta{
				Name:      taskName,
				Namespace: "default",
			},
			Spec: arkv1alpha1.A2ATaskSpec{
				TaskID:   taskID,
				QueryRef: arkv1alpha1.QueryRef{Name: queryName, Namespace: "default"},
				AgentRef: arkv1alpha1.AgentRef{Name: "test-agent"},
			},
		}
		Expect(k8sClient.Create(ctx, task)).To(Succeed())
		task.Status = arkv1alpha1.A2ATaskStatus{
			Phase: "failed",
			Error: "underlying executor crashed",
			Conditions: []metav1.Condition{{
				Type:               string(arkv1alpha1.A2ATaskCompleted),
				Status:             metav1.ConditionTrue,
				Reason:             "InvalidApprovalDecision",
				Message:            "Could not parse decision",
				LastTransitionTime: metav1.Now(),
			}},
		}
		Expect(k8sClient.Status().Update(ctx, task)).To(Succeed())

		r := &QueryReconciler{Client: k8sClient, Scheme: k8sClient.Scheme()}
		_, err := r.handleInputRequiredPhase(ctx, query, time.Now().Add(time.Hour))
		Expect(err).NotTo(HaveOccurred())

		updated := &arkv1alpha1.Query{}
		Expect(k8sClient.Get(ctx, types.NamespacedName{Name: queryName, Namespace: "default"}, updated)).To(Succeed())
		Expect(updated.Status.Phase).To(Equal(statusError))
		Expect(updated.Status.Response).NotTo(BeNil())
		Expect(updated.Status.Response.Content).To(Equal("underlying executor crashed"))
	})

	It("ends the query in error once the cascade cap is reached", func() {
		ctx := context.Background()
		defer cleanup(ctx)
		query := createQueryAwaitingApproval(ctx)

		// Pre-set the cascade count to the cap.
		query.Annotations = map[string]string{
			annotations.ApprovalCascadeCount: fmt.Sprintf("%d", maxApprovalCascades),
		}
		Expect(k8sClient.Update(ctx, query)).To(Succeed())
		// Re-fetch so query has the freshest status with response.a2a still set.
		latestQuery := &arkv1alpha1.Query{}
		Expect(k8sClient.Get(ctx, types.NamespacedName{Name: queryName, Namespace: "default"}, latestQuery)).To(Succeed())
		latestQuery.Status = query.Status
		Expect(k8sClient.Status().Update(ctx, latestQuery)).To(Succeed())

		task := &arkv1alpha1.A2ATask{
			ObjectMeta: metav1.ObjectMeta{
				Name:      taskName,
				Namespace: "default",
			},
			Spec: arkv1alpha1.A2ATaskSpec{
				TaskID:   taskID,
				QueryRef: arkv1alpha1.QueryRef{Name: queryName, Namespace: "default"},
				AgentRef: arkv1alpha1.AgentRef{Name: "test-agent"},
			},
		}
		Expect(k8sClient.Create(ctx, task)).To(Succeed())
		task.Status = arkv1alpha1.A2ATaskStatus{
			Phase: "failed",
			Error: "Approval timeout exceeded after 5m",
			Conditions: []metav1.Condition{{
				Type:               string(arkv1alpha1.A2ATaskCompleted),
				Status:             metav1.ConditionTrue,
				Reason:             "ApprovalTimeoutRejected",
				Message:            "Approval timeout exceeded",
				LastTransitionTime: metav1.Now(),
			}},
		}
		Expect(k8sClient.Status().Update(ctx, task)).To(Succeed())

		r := &QueryReconciler{Client: k8sClient, Scheme: k8sClient.Scheme()}
		_, err := r.handleInputRequiredPhase(ctx, latestQuery, time.Now().Add(time.Hour))
		Expect(err).NotTo(HaveOccurred())

		updated := &arkv1alpha1.Query{}
		Expect(k8sClient.Get(ctx, types.NamespacedName{Name: queryName, Namespace: "default"}, updated)).To(Succeed())
		Expect(updated.Status.Phase).To(Equal(statusError))
		Expect(updated.Status.Response).NotTo(BeNil())
		Expect(updated.Status.Response.Content).To(ContainSubstring("Approval cascade limit reached"))
	})

	It("resets the cascade counter when the user grants approval", func() {
		ctx := context.Background()
		defer cleanup(ctx)
		query := createQueryAwaitingApproval(ctx)

		// Seed a non-zero cascade count.
		query.Annotations = map[string]string{
			annotations.ApprovalCascadeCount: "2",
		}
		Expect(k8sClient.Update(ctx, query)).To(Succeed())
		latestQuery := &arkv1alpha1.Query{}
		Expect(k8sClient.Get(ctx, types.NamespacedName{Name: queryName, Namespace: "default"}, latestQuery)).To(Succeed())
		latestQuery.Status = query.Status
		Expect(k8sClient.Status().Update(ctx, latestQuery)).To(Succeed())

		task := &arkv1alpha1.A2ATask{
			ObjectMeta: metav1.ObjectMeta{
				Name:      taskName,
				Namespace: "default",
			},
			Spec: arkv1alpha1.A2ATaskSpec{
				TaskID:   taskID,
				QueryRef: arkv1alpha1.QueryRef{Name: queryName, Namespace: "default"},
				AgentRef: arkv1alpha1.AgentRef{Name: "test-agent"},
			},
		}
		Expect(k8sClient.Create(ctx, task)).To(Succeed())
		task.Status = arkv1alpha1.A2ATaskStatus{
			Phase: "completed",
			Conditions: []metav1.Condition{{
				Type:               string(arkv1alpha1.A2ATaskCompleted),
				Status:             metav1.ConditionTrue,
				Reason:             "ApprovalGranted",
				Message:            "User approved",
				LastTransitionTime: metav1.Now(),
			}},
		}
		Expect(k8sClient.Status().Update(ctx, task)).To(Succeed())

		r := &QueryReconciler{Client: k8sClient, Scheme: k8sClient.Scheme()}
		_, err := r.handleInputRequiredPhase(ctx, latestQuery, time.Now().Add(time.Hour))
		Expect(err).NotTo(HaveOccurred())

		updated := &arkv1alpha1.Query{}
		Expect(k8sClient.Get(ctx, types.NamespacedName{Name: queryName, Namespace: "default"}, updated)).To(Succeed())
		Expect(updated.Status.Phase).To(Equal(statusRunning))
		_, present := updated.Annotations[annotations.ApprovalCascadeCount]
		Expect(present).To(BeFalse(), "annotation should be cleared after approval")
	})
})
