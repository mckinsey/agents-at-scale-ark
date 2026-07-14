/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"fmt"
	"time"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"golang.org/x/sync/semaphore"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes/scheme"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
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
	Context("MaxConcurrentQueries enforcement", func() {
		It("requeues without spawning execution when the semaphore is full", func() {
			r := &QueryReconciler{
				Client:               k8sClient,
				Scheme:               k8sClient.Scheme(),
				MaxConcurrentQueries: 1,
				sem:                  semaphore.NewWeighted(1),
			}
			Expect(r.sem.TryAcquire(1)).To(BeTrue(), "pre-condition: semaphore should start drainable")

			query := arkv1alpha1.Query{
				ObjectMeta: metav1.ObjectMeta{
					Name:              "capacity-requeue-query",
					Namespace:         "default",
					CreationTimestamp: metav1.Time{Time: time.Now()},
				},
				Spec: arkv1alpha1.QuerySpec{
					TTL: &metav1.Duration{Duration: time.Hour},
				},
			}
			req := ctrl.Request{NamespacedName: types.NamespacedName{Name: query.Name, Namespace: query.Namespace}}

			result, err := r.handleRunningPhase(context.Background(), req, query)

			Expect(err).NotTo(HaveOccurred())
			Expect(result.RequeueAfter).To(Equal(queryCapacityRequeueDelay))

			_, exists := r.operations.Load(req.NamespacedName)
			Expect(exists).To(BeFalse(), "should not register an operation when capacity is exhausted")
		})

		It("does not enforce a cap when MaxConcurrentQueries is 0", func() {
			r := &QueryReconciler{
				Client:               k8sClient,
				Scheme:               k8sClient.Scheme(),
				MaxConcurrentQueries: 0,
			}
			Expect(r.sem).To(BeNil(), "nil semaphore means enforcement is disabled")

			query := arkv1alpha1.Query{
				ObjectMeta: metav1.ObjectMeta{
					Name:              "capacity-disabled-query",
					Namespace:         "default",
					CreationTimestamp: metav1.Time{Time: time.Now()},
				},
				Spec: arkv1alpha1.QuerySpec{
					TTL: &metav1.Duration{Duration: time.Hour},
				},
			}
			req := ctrl.Request{NamespacedName: types.NamespacedName{Name: query.Name, Namespace: query.Namespace}}

			result, err := r.handleRunningPhase(context.Background(), req, query)

			Expect(err).NotTo(HaveOccurred())
			Expect(result.RequeueAfter).To(BeZero(), "must not requeue with capacity delay when enforcement is disabled")
			_, exists := r.operations.Load(req.NamespacedName)
			Expect(exists).To(BeTrue(), "should register the operation, proving execution branch was taken despite no semaphore")
		})
	})

	Context("initSemaphore", func() {
		It("creates a semaphore sized to MaxConcurrentQueries", func() {
			r := &QueryReconciler{MaxConcurrentQueries: 3}
			r.initSemaphore()
			Expect(r.sem).NotTo(BeNil())
			Expect(r.sem.TryAcquire(3)).To(BeTrue(), "should permit MaxConcurrentQueries acquisitions")
			Expect(r.sem.TryAcquire(1)).To(BeFalse(), "should deny the next acquisition once the cap is reached")
		})

		It("leaves the semaphore nil when MaxConcurrentQueries is 0", func() {
			r := &QueryReconciler{MaxConcurrentQueries: 0}
			r.initSemaphore()
			Expect(r.sem).To(BeNil())
		})
	})

	Context("buildControllerOptions", func() {
		It("propagates MaxConcurrentReconciles when set", func() {
			r := &QueryReconciler{MaxConcurrentReconciles: 7}
			opts := r.buildControllerOptions()
			Expect(opts.MaxConcurrentReconciles).To(Equal(7))
		})
	})

	Context("SetupWithManager", func() {
		It("registers the controller and sizes the semaphore from MaxConcurrentQueries", func() {
			mgr, err := ctrl.NewManager(cfg, ctrl.Options{Scheme: scheme.Scheme})
			Expect(err).NotTo(HaveOccurred())

			r := &QueryReconciler{
				Client:                  mgr.GetClient(),
				Scheme:                  mgr.GetScheme(),
				MaxConcurrentQueries:    2,
				MaxConcurrentReconciles: 2,
			}

			Expect(r.SetupWithManager(mgr)).To(Succeed())

			Expect(r.sem).NotTo(BeNil(), "initSemaphore should have run via SetupWithManager")
			Expect(r.sem.TryAcquire(2)).To(BeTrue(), "semaphore should permit MaxConcurrentQueries acquisitions")
			Expect(r.sem.TryAcquire(1)).To(BeFalse(), "semaphore should refuse the next acquisition once the cap is reached")
		})
	})

	Context("finishExecuteQueryAsync", func() {
		It("deletes the operation entry and releases the semaphore", func() {
			r := &QueryReconciler{
				MaxConcurrentQueries: 1,
				sem:                  semaphore.NewWeighted(1),
			}
			// Saturate the semaphore to model "a query is already in flight"; the
			// next TryAcquire fails until something releases the slot.
			Expect(r.sem.TryAcquire(1)).To(BeTrue())
			Expect(r.sem.TryAcquire(1)).To(BeFalse(), "semaphore should now be full")

			namespacedName := types.NamespacedName{Name: "finish-query", Namespace: "default"}
			_, cancel := context.WithCancel(context.Background())
			defer cancel()
			r.operations.Store(namespacedName, cancel)

			r.finishExecuteQueryAsync(context.Background(), namespacedName)

			_, exists := r.operations.Load(namespacedName)
			Expect(exists).To(BeFalse(), "operations entry should be cleared")
			Expect(r.sem.TryAcquire(1)).To(BeTrue(), "semaphore slot should have been released")
		})

		It("does not panic when the semaphore is nil", func() {
			r := &QueryReconciler{}
			namespacedName := types.NamespacedName{Name: "no-sem-query", Namespace: "default"}
			r.operations.Store(namespacedName, context.CancelFunc(func() {}))

			Expect(func() { r.finishExecuteQueryAsync(context.Background(), namespacedName) }).NotTo(Panic())

			_, exists := r.operations.Load(namespacedName)
			Expect(exists).To(BeFalse())
		})

		It("recovers from a panic in the goroutine and still cleans up", func() {
			r := &QueryReconciler{
				MaxConcurrentQueries: 1,
				sem:                  semaphore.NewWeighted(1),
			}
			Expect(r.sem.TryAcquire(1)).To(BeTrue())

			namespacedName := types.NamespacedName{Name: "panic-query", Namespace: "default"}
			r.operations.Store(namespacedName, context.CancelFunc(func() {}))

			Expect(func() {
				defer r.finishExecuteQueryAsync(context.Background(), namespacedName)
				panic("simulated execution panic")
			}).NotTo(Panic())

			_, exists := r.operations.Load(namespacedName)
			Expect(exists).To(BeFalse(), "cleanup must run even on panic")
			Expect(r.sem.TryAcquire(1)).To(BeTrue(), "semaphore must be released even on panic")
		})
	})
})

var _ = Describe("Query TTL helpers", func() {
	Describe("ttlRemaining", func() {
		It("returns 0 when TTL is not configured", func() {
			q := &arkv1alpha1.Query{}
			Expect(ttlRemaining(q)).To(BeZero())
		})

		It("returns a positive duration when terminal and completion is recent", func() {
			q := &arkv1alpha1.Query{
				Spec: arkv1alpha1.QuerySpec{TTL: &metav1.Duration{Duration: time.Hour}},
				Status: arkv1alpha1.QueryStatus{
					Phase: statusDone,
					Conditions: []metav1.Condition{{
						Type:               string(arkv1alpha1.QueryCompleted),
						Status:             metav1.ConditionTrue,
						LastTransitionTime: metav1.NewTime(time.Now().Add(-10 * time.Minute)),
					}},
				},
			}
			Expect(ttlRemaining(q)).To(BeNumerically("~", 50*time.Minute, time.Minute))
		})

		It("returns a negative duration when TTL has elapsed since completion", func() {
			q := &arkv1alpha1.Query{
				Spec: arkv1alpha1.QuerySpec{TTL: &metav1.Duration{Duration: time.Hour}},
				Status: arkv1alpha1.QueryStatus{
					Phase: statusDone,
					Conditions: []metav1.Condition{{
						Type:               string(arkv1alpha1.QueryCompleted),
						Status:             metav1.ConditionTrue,
						LastTransitionTime: metav1.NewTime(time.Now().Add(-2 * time.Hour)),
					}},
				},
			}
			Expect(ttlRemaining(q)).To(BeNumerically("<", 0))
		})

		It("falls back to CreationTimestamp when no QueryCompleted condition is set", func() {
			q := &arkv1alpha1.Query{
				ObjectMeta: metav1.ObjectMeta{CreationTimestamp: metav1.NewTime(time.Now().Add(-2 * time.Hour))},
				Spec:       arkv1alpha1.QuerySpec{TTL: &metav1.Duration{Duration: time.Hour}},
			}
			Expect(ttlRemaining(q)).To(BeNumerically("<", 0))
		})

		It("falls back to CreationTimestamp when QueryCompleted has Status=False (in-flight)", func() {
			q := &arkv1alpha1.Query{
				ObjectMeta: metav1.ObjectMeta{CreationTimestamp: metav1.NewTime(time.Now().Add(-2 * time.Hour))},
				Spec:       arkv1alpha1.QuerySpec{TTL: &metav1.Duration{Duration: time.Hour}},
				Status: arkv1alpha1.QueryStatus{
					Phase: statusRunning,
					Conditions: []metav1.Condition{{
						Type:               string(arkv1alpha1.QueryCompleted),
						Status:             metav1.ConditionFalse,
						LastTransitionTime: metav1.NewTime(time.Now()),
					}},
				},
			}
			Expect(ttlRemaining(q)).To(BeNumerically("<", 0))
		})
	})

	Describe("queryCompletedAt", func() {
		It("returns nil when no QueryCompleted condition is set", func() {
			Expect(queryCompletedAt(&arkv1alpha1.Query{})).To(BeNil())
		})

		It("returns nil when QueryCompleted is Status=False", func() {
			q := &arkv1alpha1.Query{
				Status: arkv1alpha1.QueryStatus{
					Conditions: []metav1.Condition{{
						Type:   string(arkv1alpha1.QueryCompleted),
						Status: metav1.ConditionFalse,
					}},
				},
			}
			Expect(queryCompletedAt(q)).To(BeNil())
		})

		It("returns LastTransitionTime when QueryCompleted is Status=True", func() {
			at := time.Now().Add(-time.Hour).Truncate(time.Second)
			q := &arkv1alpha1.Query{
				Status: arkv1alpha1.QueryStatus{
					Conditions: []metav1.Condition{{
						Type:               string(arkv1alpha1.QueryCompleted),
						Status:             metav1.ConditionTrue,
						LastTransitionTime: metav1.NewTime(at),
					}},
				},
			}
			got := queryCompletedAt(q)
			Expect(got).NotTo(BeNil())
			Expect(*got).To(Equal(at))
		})
	})

	Describe("isTerminalPhase", func() {
		It("returns true for done/error/canceled", func() {
			Expect(isTerminalPhase(statusDone)).To(BeTrue())
			Expect(isTerminalPhase(statusError)).To(BeTrue())
			Expect(isTerminalPhase(statusCanceled)).To(BeTrue())
		})
		It("returns false for in-flight or unknown phases", func() {
			Expect(isTerminalPhase(statusRunning)).To(BeFalse())
			Expect(isTerminalPhase(statusProvisioning)).To(BeFalse())
			Expect(isTerminalPhase(statusPending)).To(BeFalse())
			Expect(isTerminalPhase("")).To(BeFalse())
		})
	})
})

var _ = Describe("Query Controller Reconcile TTL GC guard", func() {
	ctx := context.Background()

	It("deletes a terminal-phase Query whose TTL has elapsed since completion", func() {
		// Also covers #2828: with the finalizer present, r.Delete only
		// marks the Query Terminating, so Reconcile must reach
		// handleFinalizer in the same pass to clear the finalizer.
		// Without it the Query stays Terminating forever.
		name := "ttl-elapsed-terminal-query"
		key := types.NamespacedName{Name: name, Namespace: "default"}

		query := &arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "default"},
			Spec: arkv1alpha1.QuerySpec{
				Target: &arkv1alpha1.QueryTarget{Type: "agent", Name: "test-agent"},
				TTL:    &metav1.Duration{Duration: time.Nanosecond},
			},
		}
		Expect(query.Spec.SetInputString("hello")).To(Succeed())
		Expect(k8sClient.Create(ctx, query)).To(Succeed())

		Expect(k8sClient.Get(ctx, key, query)).To(Succeed())
		controllerutil.AddFinalizer(query, finalizer)
		Expect(k8sClient.Update(ctx, query)).To(Succeed())

		Expect(k8sClient.Get(ctx, key, query)).To(Succeed())
		query.Status.Phase = statusDone
		query.Status.Conditions = []metav1.Condition{{
			Type:               string(arkv1alpha1.QueryCompleted),
			Status:             metav1.ConditionTrue,
			Reason:             "QuerySucceeded",
			Message:            "Query completed successfully",
			LastTransitionTime: metav1.NewTime(time.Now().Add(-time.Hour)),
		}}
		Expect(k8sClient.Status().Update(ctx, query)).To(Succeed())

		r := &QueryReconciler{Client: k8sClient, Scheme: k8sClient.Scheme()}
		_, err := r.Reconcile(ctx, ctrl.Request{NamespacedName: key})
		Expect(err).NotTo(HaveOccurred())

		err = k8sClient.Get(ctx, key, &arkv1alpha1.Query{})
		Expect(errors.IsNotFound(err)).To(BeTrue(), "Query should be fully reaped when terminal phase + TTL elapsed, not stuck Terminating with finalizer")
	})

	It("does NOT delete a non-terminal Query even when its TTL has elapsed since creation", func() {
		// Regression test for #2693: the old controller measured TTL from
		// CreationTimestamp regardless of phase, which would reap a long-
		// running or queue-backlogged Query mid-flight.
		name := "ttl-elapsed-running-query"
		key := types.NamespacedName{Name: name, Namespace: "default"}

		query := &arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "default"},
			Spec: arkv1alpha1.QuerySpec{
				Target: &arkv1alpha1.QueryTarget{Type: "agent", Name: "test-agent"},
				TTL:    &metav1.Duration{Duration: time.Nanosecond},
			},
		}
		Expect(query.Spec.SetInputString("hello")).To(Succeed())
		Expect(k8sClient.Create(ctx, query)).To(Succeed())

		// Sleep so time.Since(CreationTimestamp) > TTL (1ns). Without the
		// fix, ttlRemaining would be negative and the guard would delete.
		time.Sleep(10 * time.Millisecond)

		// Pre-add the finalizer so Reconcile reaches handleQueryExecution
		// in a single pass instead of returning early to write it first.
		Expect(k8sClient.Get(ctx, key, query)).To(Succeed())
		controllerutil.AddFinalizer(query, finalizer)
		Expect(k8sClient.Update(ctx, query)).To(Succeed())

		Expect(k8sClient.Get(ctx, key, query)).To(Succeed())
		query.Status.Phase = statusRunning
		query.Status.Conditions = []metav1.Condition{{
			Type:               string(arkv1alpha1.QueryCompleted),
			Status:             metav1.ConditionFalse,
			Reason:             "QueryRunning",
			Message:            "Query is running",
			LastTransitionTime: metav1.NewTime(time.Now()),
		}}
		Expect(k8sClient.Status().Update(ctx, query)).To(Succeed())

		r := &QueryReconciler{Client: k8sClient, Scheme: k8sClient.Scheme()}
		// Pre-register an operation so handleRunningPhase short-circuits
		// instead of spawning an executor goroutine we'd have to drain.
		_, cancel := context.WithCancel(ctx)
		defer cancel()
		r.operations.Store(key, cancel)

		_, err := r.Reconcile(ctx, ctrl.Request{NamespacedName: key})
		Expect(err).NotTo(HaveOccurred())

		var refetched arkv1alpha1.Query
		Expect(k8sClient.Get(ctx, key, &refetched)).To(Succeed())
		Expect(refetched.DeletionTimestamp.IsZero()).To(BeTrue(), "in-flight Query must not be GC'd even when TTL has elapsed since creation")

		// Cleanup: remove finalizer so Delete actually removes the object.
		r.operations.Delete(key)
		controllerutil.RemoveFinalizer(&refetched, finalizer)
		Expect(k8sClient.Update(ctx, &refetched)).To(Succeed())
		Expect(k8sClient.Delete(ctx, &refetched)).To(Succeed())
	})

	It("requeues a terminal Query for GC at completedAt + TTL when TTL has not yet elapsed", func() {
		name := "ttl-pending-terminal-query"
		key := types.NamespacedName{Name: name, Namespace: "default"}

		query := &arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "default"},
			Spec: arkv1alpha1.QuerySpec{
				Target: &arkv1alpha1.QueryTarget{Type: "agent", Name: "test-agent"},
				TTL:    &metav1.Duration{Duration: time.Hour},
			},
		}
		Expect(query.Spec.SetInputString("hello")).To(Succeed())
		Expect(k8sClient.Create(ctx, query)).To(Succeed())

		// Pre-add the finalizer so Reconcile reaches handleQueryExecution
		// in a single pass instead of returning early to write it first.
		Expect(k8sClient.Get(ctx, key, query)).To(Succeed())
		controllerutil.AddFinalizer(query, finalizer)
		Expect(k8sClient.Update(ctx, query)).To(Succeed())

		completedAt := time.Now().Add(-10 * time.Minute)
		Expect(k8sClient.Get(ctx, key, query)).To(Succeed())
		query.Status.Phase = statusDone
		query.Status.Conditions = []metav1.Condition{{
			Type:               string(arkv1alpha1.QueryCompleted),
			Status:             metav1.ConditionTrue,
			Reason:             "QuerySucceeded",
			Message:            "Query completed successfully",
			LastTransitionTime: metav1.NewTime(completedAt),
		}}
		Expect(k8sClient.Status().Update(ctx, query)).To(Succeed())

		r := &QueryReconciler{Client: k8sClient, Scheme: k8sClient.Scheme()}
		result, err := r.Reconcile(ctx, ctrl.Request{NamespacedName: key})
		Expect(err).NotTo(HaveOccurred())

		var refetched arkv1alpha1.Query
		Expect(k8sClient.Get(ctx, key, &refetched)).To(Succeed())
		Expect(refetched.DeletionTimestamp.IsZero()).To(BeTrue(), "terminal Query with TTL still remaining must not be GC'd yet")
		Expect(result.RequeueAfter).To(BeNumerically("~", 50*time.Minute, time.Minute), "RequeueAfter should target completedAt + TTL")

		// Cleanup: remove finalizer so Delete actually removes the object.
		Expect(k8sClient.Get(ctx, key, &refetched)).To(Succeed())
		controllerutil.RemoveFinalizer(&refetched, finalizer)
		Expect(k8sClient.Update(ctx, &refetched)).To(Succeed())
		Expect(k8sClient.Delete(ctx, &refetched)).To(Succeed())
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
		_, err := r.handleInputRequiredPhase(ctx, query)
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
		_, err := r.handleInputRequiredPhase(ctx, query)
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
		_, err := r.handleInputRequiredPhase(ctx, latestQuery)
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
		_, err := r.handleInputRequiredPhase(ctx, latestQuery)
		Expect(err).NotTo(HaveOccurred())

		updated := &arkv1alpha1.Query{}
		Expect(k8sClient.Get(ctx, types.NamespacedName{Name: queryName, Namespace: "default"}, updated)).To(Succeed())
		Expect(updated.Status.Phase).To(Equal(statusRunning))
		_, present := updated.Annotations[annotations.ApprovalCascadeCount]
		Expect(present).To(BeFalse(), "annotation should be cleared after approval")
	})
})
