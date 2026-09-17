/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"errors"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"k8s.io/apimachinery/pkg/api/meta"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	arka2a "mckinsey.com/ark/internal/a2a"
	eventnoop "mckinsey.com/ark/internal/eventing/noop"
)

var _ = Describe("A2AServer Controller", func() {
	ctx := context.Background()

	It("should not error when updating status of a deleted A2AServer", func() {
		const deletedName = "test-deleted-status-a2aserver"

		deletedA2AServer := &arkv1prealpha1.A2AServer{
			ObjectMeta: metav1.ObjectMeta{
				Name:      deletedName,
				Namespace: "default",
			},
			Spec: arkv1prealpha1.A2AServerSpec{
				Address: arkv1prealpha1.ValueSource{Value: "http://localhost:8080"},
			},
		}
		Expect(k8sClient.Create(ctx, deletedA2AServer)).To(Succeed())

		controllerReconciler := &A2AServerReconciler{
			Client:   k8sClient,
			Scheme:   k8sClient.Scheme(),
			Eventing: eventnoop.NewProvider(),
		}

		By("reconciling to initialize status")
		_, err := controllerReconciler.Reconcile(ctx, reconcile.Request{
			NamespacedName: types.NamespacedName{Name: deletedName, Namespace: "default"},
		})
		Expect(err).NotTo(HaveOccurred())

		By("deleting the A2AServer")
		Expect(k8sClient.Delete(ctx, deletedA2AServer)).To(Succeed())

		By("calling updateStatusWithConditions on the deleted A2AServer should not error")
		Expect(controllerReconciler.updateStatusWithConditions(ctx, deletedA2AServer)).To(Succeed())
	})
})

var _ = Describe("A2AServer endpoint resolution", func() {
	ctx := context.Background()

	const address = "http://a2a-server.default.svc.cluster.local:80/agent"

	newReconciler := func() *A2AServerReconciler {
		return &A2AServerReconciler{
			Client:   k8sClient,
			Scheme:   k8sClient.Scheme(),
			Eventing: eventnoop.NewProvider(),
		}
	}

	createServer := func(name string, spec arkv1prealpha1.A2AServerSpec) *arkv1prealpha1.A2AServer {
		spec.Address = arkv1prealpha1.ValueSource{Value: address}
		server := &arkv1prealpha1.A2AServer{
			ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "default"},
			Spec:       spec,
		}
		Expect(k8sClient.Create(ctx, server)).To(Succeed())
		DeferCleanup(func() {
			Expect(client.IgnoreNotFound(k8sClient.Delete(ctx, server))).To(Succeed())
		})
		server.Status.LastResolvedAddress = address
		return server
	}

	findCondition := func(server *arkv1prealpha1.A2AServer, conditionType string) *metav1.Condition {
		return meta.FindStatusCondition(server.Status.Conditions, conditionType)
	}

	It("records the address as the endpoint and sets no override condition in address mode", func() {
		server := createServer("endpoint-address-mode", arkv1prealpha1.A2AServerSpec{})
		Expect(newReconciler().reconcileEndpoint(ctx, server, address, "http://elsewhere.example.com/rpc")).To(Succeed())

		Expect(server.Status.LastResolvedEndpoint).To(Equal(address))
		Expect(server.Status.RejectedEndpoint).To(BeEmpty())
		Expect(findCondition(server, A2AServerEndpointOverride)).To(BeNil())
	})

	It("clears an override condition left over from a previous mode", func() {
		server := createServer("endpoint-address-mode-clears", arkv1prealpha1.A2AServerSpec{})
		reconciler := newReconciler()
		reconciler.reconcileCondition(server, A2AServerEndpointOverride, metav1.ConditionTrue, "AgentCardEndpointApplied", "stale")

		Expect(reconciler.reconcileEndpoint(ctx, server, address, "")).To(Succeed())
		Expect(findCondition(server, A2AServerEndpointOverride)).To(BeNil())
	})

	It("takes only the path from the card in cardPath mode", func() {
		server := createServer("endpoint-card-path", arkv1prealpha1.A2AServerSpec{
			EndpointResolution: arka2a.EndpointResolutionCardPath,
		})
		Expect(newReconciler().reconcileEndpoint(ctx, server, address, "https://public.example.com/rpc/v1")).To(Succeed())

		Expect(server.Status.LastResolvedEndpoint).To(Equal("http://a2a-server.default.svc.cluster.local:80/rpc/v1"))
		Expect(server.Status.RejectedEndpoint).To(BeEmpty())

		condition := findCondition(server, A2AServerEndpointOverride)
		Expect(condition).NotTo(BeNil())
		Expect(condition.Status).To(Equal(metav1.ConditionTrue))
		Expect(condition.Reason).To(Equal("AgentCardEndpointApplied"))
	})

	It("uses the card url when its host is allowlisted", func() {
		server := createServer("endpoint-card-url-allowed", arkv1prealpha1.A2AServerSpec{
			EndpointResolution:   arka2a.EndpointResolutionCardURL,
			AllowedEndpointHosts: []string{"public.example.com"},
		})
		Expect(newReconciler().reconcileEndpoint(ctx, server, address, "https://public.example.com/rpc")).To(Succeed())

		Expect(server.Status.LastResolvedEndpoint).To(Equal("https://public.example.com/rpc"))
		Expect(server.Status.RejectedEndpoint).To(BeEmpty())
		Expect(findCondition(server, A2AServerEndpointOverride).Status).To(Equal(metav1.ConditionTrue))
	})

	It("falls back to the address and records the rejection for a cross origin card url", func() {
		server := createServer("endpoint-card-url-rejected", arkv1prealpha1.A2AServerSpec{
			EndpointResolution: arka2a.EndpointResolutionCardURL,
		})
		reconciler := newReconciler()
		Expect(reconciler.reconcileEndpoint(ctx, server, address, "https://attacker.example.com/rpc")).To(Succeed())

		Expect(server.Status.LastResolvedEndpoint).To(Equal(address))
		Expect(server.Status.RejectedEndpoint).To(Equal("https://attacker.example.com/rpc"))

		condition := findCondition(server, A2AServerEndpointOverride)
		Expect(condition).NotTo(BeNil())
		Expect(condition.Status).To(Equal(metav1.ConditionFalse))
		Expect(condition.Reason).To(Equal(arka2a.ReasonCrossOriginNotAllow))

		By("staying stable when the same rejection repeats")
		Expect(reconciler.reconcileEndpoint(ctx, server, address, "https://attacker.example.com/rpc")).To(Succeed())
		Expect(server.Status.RejectedEndpoint).To(Equal("https://attacker.example.com/rpc"))
	})

	It("reports an unsupported transport as not ready", func() {
		server := createServer("endpoint-unsupported-transport", arkv1prealpha1.A2AServerSpec{})
		reconciler := newReconciler()
		Expect(reconciler.reconcileConditionsInitializing(ctx, server)).To(Succeed())

		Expect(reconciler.reconcileConditionsUnsupportedTransport(ctx, server, errors.New("agent card declares no JSONRPC interface, transports: GRPC"))).To(Succeed())

		ready := findCondition(server, A2AServerReady)
		Expect(ready.Status).To(Equal(metav1.ConditionFalse))
		Expect(ready.Reason).To(Equal("UnsupportedTransport"))
		Expect(ready.Message).To(ContainSubstring("GRPC"))

		discovering := findCondition(server, A2AServerDiscovering)
		Expect(discovering.Status).To(Equal(metav1.ConditionFalse))
		Expect(discovering.Reason).To(Equal("UnsupportedTransport"))

		By("staying stable when the transport is still unsupported")
		Expect(reconciler.reconcileConditionsUnsupportedTransport(ctx, server, errors.New("agent card declares no JSONRPC interface, transports: GRPC"))).To(Succeed())
		Expect(findCondition(server, A2AServerReady).Reason).To(Equal("UnsupportedTransport"))
	})
})
