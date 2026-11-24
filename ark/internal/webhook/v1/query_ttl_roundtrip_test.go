/* Copyright 2025. McKinsey & Company */

package v1

import (
	"context"
	"time"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

// Reproduces the chainsaw global-ttl / argo-ark-query failures seen on main:
// an explicit spec.ttl must survive admission through the *real* mutating
// webhook (served over the envtest webhook server, not the in-process
// fake-client shortcut the other webhook tests use) normalized to Go's
// canonical time.Duration string form, exactly as those chainsaw tests
// assert.
var _ = Describe("Query TTL admission round-trip", func() {
	It("normalizes the user-supplied spec.ttl across the real admission webhook", func() {
		agent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "placeholder-agent",
				Namespace: "default",
			},
			Spec: arkv1alpha1.AgentSpec{
				Prompt: "placeholder agent for ttl webhook round-trip test",
			},
		}
		Expect(k8sClient.Create(context.Background(), agent)).To(Succeed())
		DeferCleanup(func() {
			_ = k8sClient.Delete(context.Background(), agent)
		})

		name := "ttl-roundtrip-query"
		q := &arkv1alpha1.Query{
			ObjectMeta: metav1.ObjectMeta{
				Name:      name,
				Namespace: "default",
			},
			Spec: arkv1alpha1.QuerySpec{
				Target: &arkv1alpha1.QueryTarget{Type: "agent", Name: "placeholder-agent"},
				TTL:    &metav1.Duration{Duration: 5 * time.Minute},
			},
		}
		Expect(q.Spec.SetInputString("hello")).To(Succeed())

		Expect(k8sClient.Create(context.Background(), q)).To(Succeed())
		DeferCleanup(func() {
			_ = k8sClient.Delete(context.Background(), q)
		})

		var got arkv1alpha1.Query
		Expect(k8sClient.Get(context.Background(), types.NamespacedName{Name: name, Namespace: "default"}, &got)).To(Succeed())

		Expect(got.Spec.TTL).NotTo(BeNil())
		Expect(got.Spec.TTL.Duration.String()).To(Equal("5m0s"),
			"spec.ttl must round-trip to Go's canonical Duration string, matching what chainsaw's global-ttl/argo-ark-query tests assert")
	})
})
