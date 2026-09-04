/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"sync/atomic"
	"time"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/scheme"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	metricsserver "sigs.k8s.io/controller-runtime/pkg/metrics/server"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

type recordingReconciler struct {
	reconciles atomic.Int64
}

func (r *recordingReconciler) Reconcile(context.Context, reconcile.Request) (ctrl.Result, error) {
	r.reconciles.Add(1)
	return ctrl.Result{}, nil
}

func (r *recordingReconciler) count() int64 {
	return r.reconciles.Load()
}

var _ = Describe("A2ATask Controller event filter", func() {
	It("skips annotation-only updates but reconciles create, status and generation changes", func() {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		mgr, err := ctrl.NewManager(cfg, ctrl.Options{
			Scheme:  scheme.Scheme,
			Metrics: metricsserver.Options{BindAddress: "0"},
		})
		Expect(err).NotTo(HaveOccurred())

		rec := &recordingReconciler{}
		Expect(setupA2ATaskController(mgr, rec)).To(Succeed())

		go func() {
			defer GinkgoRecover()
			Expect(mgr.Start(ctx)).To(Succeed())
		}()
		Expect(mgr.GetCache().WaitForCacheSync(ctx)).To(BeTrue())

		// Timeout and TTL are set explicitly: the CRD defaults store "12h"/"720h",
		// which the typed client re-marshals as "12h0m0s"/"720h0m0s" on the first
		// Update — a spec change that bumps the generation and would defeat the
		// annotation-only assertion below.
		task := &arkv1alpha1.A2ATask{
			ObjectMeta: metav1.ObjectMeta{Name: "predicate-filter-task", Namespace: "default"},
			Spec: arkv1alpha1.A2ATaskSpec{
				QueryRef: arkv1alpha1.QueryRef{Name: "predicate-test-query"},
				AgentRef: arkv1alpha1.AgentRef{Name: "predicate-test-agent"},
				TaskID:   "predicate-test-task-id",
				Timeout:  &metav1.Duration{Duration: 12 * time.Hour},
				TTL:      &metav1.Duration{Duration: 720 * time.Hour},
			},
		}
		Expect(k8sClient.Create(ctx, task)).To(Succeed())
		DeferCleanup(func() {
			Expect(client.IgnoreNotFound(k8sClient.Delete(context.Background(), task))).To(Succeed())
		})

		Eventually(rec.count, 5*time.Second).Should(Equal(int64(1)), "create event should trigger a reconcile")

		Expect(k8sClient.Get(ctx, client.ObjectKeyFromObject(task), task)).To(Succeed())
		generationBefore := task.Generation
		task.Annotations = map[string]string{pollFailureCountAnnotation: "3"}
		Expect(k8sClient.Update(ctx, task)).To(Succeed())

		Expect(k8sClient.Get(ctx, client.ObjectKeyFromObject(task), task)).To(Succeed())
		Expect(task.Generation).To(Equal(generationBefore), "annotation update must not bump generation")

		Consistently(rec.count, time.Second, 50*time.Millisecond).Should(Equal(int64(1)),
			"annotation-only update must not trigger a reconcile")

		// The reconciler drives its TaskNotStarted/approval handshakes through its
		// own status writes with no RequeueAfter, so status-only updates must pass
		// the filter or fresh tasks stall on the first pass.
		Expect(k8sClient.Get(ctx, client.ObjectKeyFromObject(task), task)).To(Succeed())
		meta.SetStatusCondition(&task.Status.Conditions, metav1.Condition{
			Type:   "Completed",
			Status: metav1.ConditionFalse,
			Reason: "TaskNotStarted",
		})
		Expect(k8sClient.Status().Update(ctx, task)).To(Succeed())

		Expect(k8sClient.Get(ctx, client.ObjectKeyFromObject(task), task)).To(Succeed())
		Expect(task.Generation).To(Equal(generationBefore), "status update must not bump generation")

		Eventually(rec.count, 5*time.Second).Should(Equal(int64(2)), "status-only update should trigger a reconcile")

		task.Spec.Input = "updated input"
		Expect(k8sClient.Update(ctx, task)).To(Succeed())

		Eventually(rec.count, 5*time.Second).Should(Equal(int64(3)), "generation change should trigger a reconcile")
	})
})
