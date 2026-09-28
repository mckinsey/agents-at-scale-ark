/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"sync/atomic"
	"time"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/scheme"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/config"
	metricsserver "sigs.k8s.io/controller-runtime/pkg/metrics/server"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	eventingconfig "mckinsey.com/ark/internal/eventing/config"
	telemetryconfig "mckinsey.com/ark/internal/telemetry/config"
)

// countingReconciler wraps a real reconciler and counts every Reconcile call,
// regardless of what triggered it (initial enqueue vs. watch event from the
// controller's own status write).
type countingReconciler struct {
	inner reconcile.Reconciler
	count atomic.Int64
}

func (c *countingReconciler) Reconcile(ctx context.Context, req reconcile.Request) (ctrl.Result, error) {
	c.count.Add(1)
	return c.inner.Reconcile(ctx, req)
}

// Repro for #3437: the Query controller is the sole writer of Query status
// but watches Query with no predicate, so its own status writes bounce back
// as watch events and trigger extra reconciles.
var _ = Describe("Query Controller reconcile amplification (bug repro for #3437)", func() {
	It("reconciles more times than the number of external triggers", func() {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		skipNameValidation := true
		mgr, err := ctrl.NewManager(cfg, ctrl.Options{
			Scheme:  scheme.Scheme,
			Metrics: metricsserver.Options{BindAddress: "0"},
			Controller: config.Controller{
				// This suite runs many specs (each its own manager) in one
				// process; other specs also register a "query" controller
				// for the real SetupWithManager, and controller-runtime
				// tracks controller names as unique per-process.
				SkipNameValidation: &skipNameValidation,
			},
		})
		Expect(err).NotTo(HaveOccurred())

		r := &QueryReconciler{
			Client:    mgr.GetClient(),
			Scheme:    mgr.GetScheme(),
			Telemetry: telemetryconfig.NewProvider(ctx, nil),
			Eventing:  eventingconfig.NewProviderWithClient(ctx, nil),
		}
		r.initSemaphore()

		counting := &countingReconciler{inner: r}
		Expect(setupQueryController(mgr, r, counting)).To(Succeed())

		go func() {
			defer GinkgoRecover()
			Expect(mgr.Start(ctx)).To(Succeed())
		}()
		Expect(mgr.GetCache().WaitForCacheSync(ctx)).To(BeTrue())

		query := &arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "amplification-repro", Namespace: "default"},
			Spec: arkv1alpha1.QuerySpec{
				Target: &arkv1alpha1.QueryTarget{Type: "agent", Name: "test-agent"},
				Input:  runtime.RawExtension{Raw: []byte(`"hello"`)},
			},
		}
		Expect(k8sClient.Create(ctx, query)).To(Succeed())
		DeferCleanup(func() {
			Expect(client.IgnoreNotFound(k8sClient.Delete(context.Background(), query))).To(Succeed())
		})

		reconcileCount := func() int64 { return counting.count.Load() }

		// One external trigger (the Create above) still legitimately produces
		// a few reconciles: the finalizer add (metadata change, not filtered),
		// the QueryNotStarted condition write (self-requeues explicitly since
		// handleQueryExecution hasn't run yet), and the transition into
		// Running. All three are real state transitions, not watch-echoes of
		// a status write, so the predicate lets them through / they carry
		// their own explicit Requeue.
		Eventually(reconcileCount, 5*time.Second, 50*time.Millisecond).
			Should(BeNumerically(">=", 3), "finalizer add, condition write, and running transition must still reconcile")

		Eventually(func() string {
			var latest arkv1alpha1.Query
			if err := k8sClient.Get(ctx, client.ObjectKeyFromObject(query), &latest); err != nil {
				return ""
			}
			return latest.Status.Phase
		}, 5*time.Second, 50*time.Millisecond).Should(Equal(statusError))

		// This is the actual fix under test: the goroutine's terminal Error
		// write is a pure status change, so the predicate drops the watch
		// event it used to trigger. The reconcile count must NOT grow just
		// because the Query went terminal — before the fix this always added
		// one more (5 total instead of 3).
		Consistently(reconcileCount, 2*time.Second, 100*time.Millisecond).
			Should(Equal(reconcileCount()), "a terminal status write alone must not trigger another reconcile")

		Expect(reconcileCount()).To(BeNumerically("<", 5),
			"amplification regression: pre-fix this scenario produced 5 reconciles for 1 external trigger")
	})
})
