/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	arka2a "mckinsey.com/ark/internal/a2a"
	eventnoop "mckinsey.com/ark/internal/eventing/noop"
)

var _ = Describe("A2AServer Discovering condition", func() {
	ctx := context.Background()

	It("returns to Discovering=False when only the agent card version changes", func() {
		var version atomic.Value
		version.Store("1.0.0")

		cardServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != arka2a.AgentCardPathVersion3 {
				http.NotFound(w, r)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(arka2a.A2AAgentCard{
				Name:        "version-bump",
				Description: "version bump agent",
				URL:         "http://example.invalid/rpc",
				Version:     version.Load().(string),
			})
		}))
		DeferCleanup(cardServer.Close)

		const name = "discovering-version-bump"
		server := &arkv1prealpha1.A2AServer{
			ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "default"},
			Spec: arkv1prealpha1.A2AServerSpec{
				Address: arkv1prealpha1.ValueSource{Value: cardServer.URL},
			},
		}
		Expect(k8sClient.Create(ctx, server)).To(Succeed())
		DeferCleanup(func() {
			Expect(client.IgnoreNotFound(k8sClient.Delete(ctx, server))).To(Succeed())
			agent := &arkv1alpha1.Agent{ObjectMeta: metav1.ObjectMeta{Name: "version-bump", Namespace: "default"}}
			Expect(client.IgnoreNotFound(k8sClient.Delete(ctx, agent))).To(Succeed())
		})

		reconciler := &A2AServerReconciler{
			Client:   k8sClient,
			Scheme:   k8sClient.Scheme(),
			Eventing: eventnoop.NewProvider(),
		}
		key := types.NamespacedName{Name: name, Namespace: "default"}
		reconcileN := func(n int) {
			for range n {
				_, err := reconciler.Reconcile(ctx, reconcile.Request{NamespacedName: key})
				Expect(err).NotTo(HaveOccurred())
			}
		}
		conditionStatus := func(conditionType string) metav1.ConditionStatus {
			current := &arkv1prealpha1.A2AServer{}
			Expect(k8sClient.Get(ctx, key, current)).To(Succeed())
			cond := meta.FindStatusCondition(current.Status.Conditions, conditionType)
			Expect(cond).NotTo(BeNil())
			return cond.Status
		}

		By("reaching steady state")
		reconcileN(3)
		Expect(conditionStatus(A2AServerReady)).To(Equal(metav1.ConditionTrue))
		Expect(conditionStatus(A2AServerDiscovering)).To(Equal(metav1.ConditionFalse))

		By("bumping only the agent card version")
		version.Store("2.0.0")
		reconcileN(3)

		current := &arkv1prealpha1.A2AServer{}
		Expect(k8sClient.Get(ctx, key, current)).To(Succeed())
		Expect(current.Status.CardVersion).To(Equal("2.0.0"))
		Expect(conditionStatus(A2AServerReady)).To(Equal(metav1.ConditionTrue))
		Expect(conditionStatus(A2AServerDiscovering)).To(Equal(metav1.ConditionFalse))

		By("not writing the status again once steady")
		resourceVersion := current.ResourceVersion
		reconcileN(2)
		Expect(k8sClient.Get(ctx, key, current)).To(Succeed())
		Expect(current.ResourceVersion).To(Equal(resourceVersion))
	})
})
