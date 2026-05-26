/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arka2a "mckinsey.com/ark/internal/a2a"
	"mckinsey.com/ark/internal/eventing"
	eventnoop "mckinsey.com/ark/internal/eventing/noop"
	"mckinsey.com/ark/internal/eventing/recorder"
)

type testA2aProvider struct {
	eventing.Provider
	a2aRec eventing.A2aRecorder
}

func (p *testA2aProvider) A2aRecorder() eventing.A2aRecorder { return p.a2aRec }

func newA2aTestProvider() eventing.Provider {
	emitter := eventnoop.NewNoopEventEmitter()
	return &testA2aProvider{
		Provider: eventnoop.NewProvider(),
		a2aRec:   recorder.NewA2aRecorder(emitter, emitter),
	}
}

var _ = Describe("A2ATask Controller", func() {
	ctx := context.Background()

	It("should not update status when status is unchanged after failed poll", func() {
		const taskName = "test-no-update-on-unchanged-status"

		a2aTask := &arkv1alpha1.A2ATask{
			ObjectMeta: metav1.ObjectMeta{
				Name:      taskName,
				Namespace: "default",
			},
			Spec: arkv1alpha1.A2ATaskSpec{
				TaskID:   "task-abc-123",
				QueryRef: arkv1alpha1.QueryRef{Name: "nonexistent-query"},
				A2AServerRef: arkv1alpha1.A2AServerRef{
					Name: "nonexistent-server",
				},
				AgentRef: arkv1alpha1.AgentRef{
					Name: "nonexistent-agent",
				},
			},
		}
		Expect(k8sClient.Create(ctx, a2aTask)).To(Succeed())

		reconciler := &A2ATaskReconciler{
			Client:   k8sClient,
			Scheme:   k8sClient.Scheme(),
			Eventing: newA2aTestProvider(),
		}

		By("reconciling once to initialize status conditions")
		_, err := reconciler.Reconcile(ctx, reconcile.Request{
			NamespacedName: types.NamespacedName{Name: taskName, Namespace: "default"},
		})
		Expect(err).NotTo(HaveOccurred())

		By("setting phase to running so the reconciler polls")
		var initialized arkv1alpha1.A2ATask
		Expect(k8sClient.Get(ctx, types.NamespacedName{Name: taskName, Namespace: "default"}, &initialized)).To(Succeed())
		initialized.Status.Phase = arka2a.PhaseRunning
		Expect(k8sClient.Status().Update(ctx, &initialized)).To(Succeed())

		By("reading resourceVersion before second reconcile")
		var running arkv1alpha1.A2ATask
		Expect(k8sClient.Get(ctx, types.NamespacedName{Name: taskName, Namespace: "default"}, &running)).To(Succeed())
		rvBefore := running.ResourceVersion

		By("reconciling with unreachable A2AServer — status unchanged, no update expected")
		_, err = reconciler.Reconcile(ctx, reconcile.Request{
			NamespacedName: types.NamespacedName{Name: taskName, Namespace: "default"},
		})
		Expect(err).NotTo(HaveOccurred())

		By("verifying resourceVersion is unchanged — Status().Update was not called")
		var after arkv1alpha1.A2ATask
		Expect(k8sClient.Get(ctx, types.NamespacedName{Name: taskName, Namespace: "default"}, &after)).To(Succeed())
		Expect(after.ResourceVersion).To(Equal(rvBefore))
	})
})
