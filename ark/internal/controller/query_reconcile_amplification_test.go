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
	"k8s.io/apimachinery/pkg/types"
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

// countingReconciler counts Reconcile calls for one key, ignoring noise from
// other specs sharing this envtest cluster.
type countingReconciler struct {
	inner reconcile.Reconciler
	key   types.NamespacedName
	count atomic.Int64
}

func (c *countingReconciler) Reconcile(ctx context.Context, req reconcile.Request) (ctrl.Result, error) {
	if req.NamespacedName == c.key {
		c.count.Add(1)
	}
	return c.inner.Reconcile(ctx, req)
}

// The Query controller is the sole writer of Query status but watches Query
// with no predicate, so its own status writes bounce back as watch events
// and trigger extra reconciles.
var _ = Describe("Query Controller reconcile amplification", func() {
	It("settles after the terminal write instead of reconciling once per own status update", func() {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		skipNameValidation := true
		mgr, err := ctrl.NewManager(cfg, ctrl.Options{
			Scheme:  scheme.Scheme,
			Metrics: metricsserver.Options{BindAddress: "0"},
			Controller: config.Controller{
				// Other specs also register a "query" controller; names must
				// be unique per-process otherwise.
				SkipNameValidation: &skipNameValidation,
			},
		})
		Expect(err).NotTo(HaveOccurred())

		r := &QueryReconciler{
			Client:    mgr.GetClient(),
			APIReader: mgr.GetAPIReader(),
			Scheme:    mgr.GetScheme(),
			Telemetry: telemetryconfig.NewProvider(ctx, nil),
			Eventing:  eventingconfig.NewProviderWithClient(ctx, nil),
		}
		r.initSemaphore()

		query := &arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "amplification-repro", Namespace: "default"},
			Spec: arkv1alpha1.QuerySpec{
				Target: &arkv1alpha1.QueryTarget{Type: "agent", Name: "test-agent"},
				Input:  runtime.RawExtension{Raw: []byte(`"hello"`)},
			},
		}
		counting := &countingReconciler{inner: r, key: client.ObjectKeyFromObject(query)}
		Expect(setupQueryController(mgr, r, counting)).To(Succeed())

		go func() {
			defer GinkgoRecover()
			Expect(mgr.Start(ctx)).To(Succeed())
		}()
		Expect(mgr.GetCache().WaitForCacheSync(ctx)).To(BeTrue())

		Expect(k8sClient.Create(ctx, query)).To(Succeed())
		DeferCleanup(func() {
			Expect(client.IgnoreNotFound(k8sClient.Delete(context.Background(), query))).To(Succeed())
		})

		reconcileCount := func() int64 { return counting.count.Load() }

		// finalizer add, condition write, and running transition each still
		// reconcile legitimately.
		Eventually(reconcileCount, 5*time.Second, 50*time.Millisecond).
			Should(BeNumerically(">=", 3))

		Eventually(func() string {
			var latest arkv1alpha1.Query
			if err := k8sClient.Get(ctx, client.ObjectKeyFromObject(query), &latest); err != nil {
				return ""
			}
			return latest.Status.Phase
		}, 5*time.Second, 50*time.Millisecond).Should(Equal(statusError))

		// signalRequeue lands one more reconcile after the terminal write.
		// Wait for it, or Consistently below could catch it mid-transition.
		Eventually(reconcileCount, 3*time.Second, 50*time.Millisecond).
			Should(BeNumerically(">=", 4))

		Consistently(reconcileCount, 2*time.Second, 100*time.Millisecond).
			Should(Equal(reconcileCount()), "count must stop growing once the terminal reconcile has run")

		Expect(reconcileCount()).To(BeNumerically("<", 6),
			"pre-fix this scenario produced 5 reconciles for 1 external trigger")
	})
})
