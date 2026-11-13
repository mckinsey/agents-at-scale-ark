/* Copyright 2025. McKinsey & Company */

package v1

import (
	"context"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/labels"
)

var _ = Describe("MCPServer name label admission", func() {
	It("sets the name label to the server's own name on create and update", func() {
		ctx := context.Background()
		server := &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "echo",
				Namespace: "default",
				Labels:    map[string]string{labels.NameLabel: "github", "team": "a"},
			},
			Spec: arkv1alpha1.MCPServerSpec{
				Transport: "http",
				Address:   arkv1alpha1.ValueSource{Value: "https://mcp.example.invalid/mcp"},
			},
		}
		Expect(k8sClient.Create(ctx, server)).To(Succeed())
		DeferCleanup(func() {
			_ = k8sClient.Delete(ctx, server)
		})

		var got arkv1alpha1.MCPServer
		key := types.NamespacedName{Name: "echo", Namespace: "default"}
		Expect(k8sClient.Get(ctx, key, &got)).To(Succeed())
		Expect(got.Labels).To(HaveKeyWithValue(labels.NameLabel, "echo"))
		Expect(got.Labels).To(HaveKeyWithValue("team", "a"))

		got.Labels[labels.NameLabel] = "github"
		Expect(k8sClient.Update(ctx, &got)).To(Succeed())
		Expect(k8sClient.Get(ctx, key, &got)).To(Succeed())
		Expect(got.Labels).To(HaveKeyWithValue(labels.NameLabel, "echo"))
	})

	It("keeps the name label on a server that is being deleted", func() {
		ctx := context.Background()
		finalizer := "e2e.ark.mckinsey.com/hold"
		server := &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{
				Name:       "terminating",
				Namespace:  "default",
				Finalizers: []string{finalizer},
			},
			Spec: arkv1alpha1.MCPServerSpec{
				Transport: "http",
				Address:   arkv1alpha1.ValueSource{Value: "https://mcp.example.invalid/mcp"},
			},
		}
		Expect(k8sClient.Create(ctx, server)).To(Succeed())
		key := types.NamespacedName{Name: "terminating", Namespace: "default"}
		DeferCleanup(func() {
			var current arkv1alpha1.MCPServer
			if k8sClient.Get(ctx, key, &current) == nil {
				current.Finalizers = nil
				_ = k8sClient.Update(ctx, &current)
			}
		})
		Expect(k8sClient.Delete(ctx, server)).To(Succeed())

		var got arkv1alpha1.MCPServer
		Expect(k8sClient.Get(ctx, key, &got)).To(Succeed())
		Expect(got.DeletionTimestamp).NotTo(BeNil())
		got.Labels[labels.NameLabel] = "github"
		Expect(k8sClient.Update(ctx, &got)).To(Succeed())

		Expect(k8sClient.Get(ctx, key, &got)).To(Succeed())
		Expect(got.Labels).To(HaveKeyWithValue(labels.NameLabel, "terminating"))

		got.Finalizers = nil
		Expect(k8sClient.Update(ctx, &got)).To(Succeed())
	})
})
