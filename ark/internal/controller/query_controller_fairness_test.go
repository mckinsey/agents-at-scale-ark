/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"time"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	eventingconfig "mckinsey.com/ark/internal/eventing/config"
	telemetryconfig "mckinsey.com/ark/internal/telemetry/config"
)

// End-to-end check that Reconcile threads the Query's namespace into the fair
// scheduler: a tenant saturating the pool cannot reclaim a freed slot that the
// scheduler is reserving for a starved tenant, and that starved tenant then
// transitions queued -> running. The share algorithm itself is unit-tested in
// fair_scheduler_test.go; this verifies the controller wiring across two real
// namespaces.
var _ = Describe("Query Controller per-namespace fairness", func() {
	It("reserves a freed slot for a starved tenant over the saturating one", func() {
		ctx := context.Background()

		const busyNS, quietNS = "fairness-busy", "fairness-quiet"
		for _, ns := range []string{busyNS, quietNS} {
			Expect(client.IgnoreAlreadyExists(k8sClient.Create(ctx, &corev1.Namespace{
				ObjectMeta: metav1.ObjectMeta{Name: ns},
			}))).To(Succeed())
		}

		r := &QueryReconciler{
			Client:               k8sClient,
			Scheme:               k8sClient.Scheme(),
			Telemetry:            telemetryconfig.NewProvider(ctx, nil),
			Eventing:             eventingconfig.NewProviderWithClient(ctx, nil),
			MaxConcurrentQueries: 2,
		}
		r.initSemaphore()

		busyKey := types.NamespacedName{Namespace: busyNS, Name: "busy-query"}

		// Busy tenant already holds the whole pool.
		Expect(r.sched.tryAcquire(busyKey)).To(BeTrue())
		Expect(r.sched.tryAcquire(busyKey)).To(BeTrue())

		quiet := &arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{Name: "quiet-query", Namespace: quietNS},
			Spec: arkv1alpha1.QuerySpec{
				Target: &arkv1alpha1.QueryTarget{Type: "agent", Name: "test-agent"},
				TTL:    &metav1.Duration{Duration: time.Hour},
			},
		}
		Expect(quiet.Spec.SetInputString("fairness test")).To(Succeed())
		Expect(k8sClient.Create(ctx, quiet)).To(Succeed())
		DeferCleanup(func() { _ = k8sClient.Delete(ctx, quiet) })
		quietReq := ctrl.Request{NamespacedName: types.NamespacedName{Name: quiet.Name, Namespace: quiet.Namespace}}

		// Pool is full: the quiet tenant is parked in queued and now counts as a
		// waiting tenant.
		_, err := r.handleRunningPhase(ctx, quietReq, *quiet)
		Expect(err).NotTo(HaveOccurred())
		queued := &arkv1alpha1.Query{}
		Expect(k8sClient.Get(ctx, quietReq.NamespacedName, queued)).To(Succeed())
		Expect(queued.Status.Phase).To(Equal(statusQueued))

		// One busy slot frees. Two tenants are now active so the fair share is 1;
		// the busy tenant is already at it and must NOT reclaim the free slot even
		// though the global pool has room.
		r.sched.release(busyNS)
		Expect(r.sched.tryAcquire(busyKey)).To(BeFalse(),
			"saturating tenant must not reclaim a slot reserved for the starved tenant while capacity remains")

		// The starved tenant takes the reserved slot and transitions to running.
		_, err = r.handleRunningPhase(ctx, quietReq, *queued)
		Expect(err).NotTo(HaveOccurred())
		running := &arkv1alpha1.Query{}
		Expect(k8sClient.Get(ctx, quietReq.NamespacedName, running)).To(Succeed())
		Expect(running.Status.Phase).To(Equal(statusRunning))
		_, exists := r.operations.Load(quietReq.NamespacedName)
		Expect(exists).To(BeTrue(), "quiet tenant should have been granted a slot and spawned execution")
		r.cleanupExistingOperation(quietReq.NamespacedName)
	})

	It("keeps a slot reserved for a tenant whose retries are slower than one second", func() {
		ctx := context.Background()

		const busyNS, quietNS = "fairness-slow-busy", "fairness-slow-quiet"
		for _, ns := range []string{busyNS, quietNS} {
			Expect(client.IgnoreAlreadyExists(k8sClient.Create(ctx, &corev1.Namespace{
				ObjectMeta: metav1.ObjectMeta{Name: ns},
			}))).To(Succeed())
		}

		r := &QueryReconciler{
			Client:               k8sClient,
			Scheme:               k8sClient.Scheme(),
			Telemetry:            telemetryconfig.NewProvider(ctx, nil),
			Eventing:             eventingconfig.NewProviderWithClient(ctx, nil),
			MaxConcurrentQueries: 2,
		}
		r.initSemaphore()
		clock := time.Unix(0, 0)
		r.sched.now = func() time.Time { return clock }

		holdBusySlot(r, busyNS)
		holdBusySlot(r, busyNS)

		newQuery := func(name, ns string) (*arkv1alpha1.Query, ctrl.Request) {
			q := &arkv1alpha1.Query{
				ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: ns},
				Spec: arkv1alpha1.QuerySpec{
					Target: &arkv1alpha1.QueryTarget{Type: "agent", Name: "test-agent"},
					TTL:    &metav1.Duration{Duration: time.Hour},
				},
			}
			Expect(q.Spec.SetInputString("slow retry fairness test")).To(Succeed())
			Expect(k8sClient.Create(ctx, q)).To(Succeed())
			DeferCleanup(func() { _ = k8sClient.Delete(ctx, q) })
			return q, ctrl.Request{NamespacedName: types.NamespacedName{Name: q.Name, Namespace: q.Namespace}}
		}
		phaseOf := func(req ctrl.Request) string {
			current := &arkv1alpha1.Query{}
			Expect(k8sClient.Get(ctx, req.NamespacedName, current)).To(Succeed())
			return current.Status.Phase
		}

		quiet, quietReq := newQuery("slow-quiet-query", quietNS)
		_, err := r.handleRunningPhase(ctx, quietReq, *quiet)
		Expect(err).NotTo(HaveOccurred())
		Expect(phaseOf(quietReq)).To(Equal(statusQueued))

		clock = clock.Add(100 * time.Millisecond)
		r.sched.release(busyNS)

		_, busyReq := newQuery("slow-busy-query", busyNS)
		for i := 0; i < 8; i++ {
			clock = clock.Add(queryCapacityRequeueDelay)
			current := &arkv1alpha1.Query{}
			Expect(k8sClient.Get(ctx, busyReq.NamespacedName, current)).To(Succeed())
			_, err := r.handleRunningPhase(ctx, busyReq, *current)
			Expect(err).NotTo(HaveOccurred())
			Expect(phaseOf(busyReq)).To(Equal(statusQueued),
				"busy tenant must not take the slot reserved for the quiet tenant (retry %d, %v after the quiet tenant's last attempt)", i+1, clock.Sub(time.Unix(0, 0)))
		}

		current := &arkv1alpha1.Query{}
		Expect(k8sClient.Get(ctx, quietReq.NamespacedName, current)).To(Succeed())
		_, err = r.handleRunningPhase(ctx, quietReq, *current)
		Expect(err).NotTo(HaveOccurred())
		Expect(phaseOf(quietReq)).To(Equal(statusRunning))
		r.cleanupExistingOperation(quietReq.NamespacedName)
	})
})

func holdBusySlot(r *QueryReconciler, ns string) {
	Expect(r.sched.tryAcquire(types.NamespacedName{Namespace: ns, Name: "held-slot"})).To(BeTrue())
}
