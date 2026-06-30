/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"time"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"golang.org/x/sync/semaphore"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes/scheme"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
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
