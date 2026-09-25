/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"k8s.io/apimachinery/pkg/api/meta"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"
	a2asrv "trpc.group/trpc-go/trpc-a2a-go/server"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	arka2a "mckinsey.com/ark/internal/a2a"
	"mckinsey.com/ark/internal/annotations"
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

	stringPtr := func(s string) *string { return &s }

	grpcOnlyCard := func(url string) *arka2a.A2AAgentCard {
		return &arka2a.A2AAgentCard{Name: "weather", URL: url, PreferredTransport: stringPtr("GRPC")}
	}

	reconcileWithCard := func(reconciler *A2AServerReconciler, server *arkv1prealpha1.A2AServer, cardURL string) error {
		card := &arka2a.A2AAgentCard{Name: "weather", URL: cardURL}
		return reconciler.reconcileEndpoint(ctx, server, reconciler.resolveEndpoint(server, address, card))
	}

	It("records the address as the endpoint and sets no override condition in address mode", func() {
		server := createServer("endpoint-address-mode", arkv1prealpha1.A2AServerSpec{})
		Expect(reconcileWithCard(newReconciler(), server, "http://elsewhere.example.com/rpc")).To(Succeed())

		Expect(server.Status.LastResolvedEndpoint).To(Equal(address))
		Expect(server.Status.RejectedEndpoint).To(BeEmpty())
		Expect(findCondition(server, A2AServerEndpointOverride)).To(BeNil())
	})

	It("clears an override condition left over from a previous mode", func() {
		server := createServer("endpoint-address-mode-clears", arkv1prealpha1.A2AServerSpec{})
		reconciler := newReconciler()
		reconciler.reconcileCondition(server, A2AServerEndpointOverride, metav1.ConditionTrue, "AgentCardEndpointApplied", "stale")

		Expect(reconcileWithCard(reconciler, server, "")).To(Succeed())
		Expect(findCondition(server, A2AServerEndpointOverride)).To(BeNil())
	})

	It("ignores the card transport in address mode", func() {
		server := createServer("endpoint-address-mode-grpc", arkv1prealpha1.A2AServerSpec{})
		reconciler := newReconciler()
		Expect(reconciler.reconcileConditionsInitializing(ctx, server)).To(Succeed())

		resolved := reconciler.resolveEndpoint(server, address, grpcOnlyCard("grpc://a2a-server.default.svc.cluster.local:50051"))
		Expect(resolved.Reason).To(BeEmpty())
		Expect(reconciler.reconcileEndpoint(ctx, server, resolved)).To(Succeed())

		Expect(server.Status.LastResolvedEndpoint).To(Equal(address))
		Expect(findCondition(server, A2AServerEndpointOverride)).To(BeNil())
		Expect(findCondition(server, A2AServerReady).Reason).To(Equal("Initializing"))
	})

	It("takes only the path from the card in cardPath mode", func() {
		server := createServer("endpoint-card-path", arkv1prealpha1.A2AServerSpec{
			EndpointResolution: arka2a.EndpointResolutionCardPath,
		})
		Expect(reconcileWithCard(newReconciler(), server, "https://public.example.com/rpc/v1")).To(Succeed())

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
		Expect(reconcileWithCard(newReconciler(), server, "https://public.example.com/rpc")).To(Succeed())

		Expect(server.Status.LastResolvedEndpoint).To(Equal("https://public.example.com/rpc"))
		Expect(server.Status.RejectedEndpoint).To(BeEmpty())
		Expect(findCondition(server, A2AServerEndpointOverride).Status).To(Equal(metav1.ConditionTrue))
	})

	It("falls back to the address and records the rejection for a cross origin card url", func() {
		server := createServer("endpoint-card-url-rejected", arkv1prealpha1.A2AServerSpec{
			EndpointResolution: arka2a.EndpointResolutionCardURL,
		})
		reconciler := newReconciler()
		Expect(reconcileWithCard(reconciler, server, "https://attacker.example.com/rpc")).To(Succeed())

		Expect(server.Status.LastResolvedEndpoint).To(Equal(address))
		Expect(server.Status.RejectedEndpoint).To(Equal("https://attacker.example.com/rpc"))

		condition := findCondition(server, A2AServerEndpointOverride)
		Expect(condition).NotTo(BeNil())
		Expect(condition.Status).To(Equal(metav1.ConditionFalse))
		Expect(condition.Reason).To(Equal(arka2a.ReasonCrossOriginNotAllow))

		By("staying stable when the same rejection repeats")
		Expect(reconcileWithCard(reconciler, server, "https://attacker.example.com/rpc")).To(Succeed())
		Expect(server.Status.RejectedEndpoint).To(Equal("https://attacker.example.com/rpc"))
	})

	It("reports a missing card url without breaking the server", func() {
		server := createServer("endpoint-no-card-url", arkv1prealpha1.A2AServerSpec{
			EndpointResolution: arka2a.EndpointResolutionCardPath,
		})
		reconciler := newReconciler()
		Expect(reconcileWithCard(reconciler, server, "")).To(Succeed())

		Expect(server.Status.LastResolvedEndpoint).To(Equal(address))
		Expect(server.Status.RejectedEndpoint).To(BeEmpty())

		condition := findCondition(server, A2AServerEndpointOverride)
		Expect(condition).NotTo(BeNil())
		Expect(condition.Status).To(Equal(metav1.ConditionFalse))
		Expect(condition.Reason).To(Equal(arka2a.ReasonNoAgentCardURL))

		By("staying stable when the card still has no url")
		Expect(reconcileWithCard(reconciler, server, "")).To(Succeed())
		Expect(findCondition(server, A2AServerEndpointOverride).Reason).To(Equal(arka2a.ReasonNoAgentCardURL))
	})

	It("falls back to the address when the card has no json-rpc interface in a card mode", func() {
		server := createServer("endpoint-unsupported-transport", arkv1prealpha1.A2AServerSpec{
			EndpointResolution: arka2a.EndpointResolutionCardPath,
		})
		reconciler := newReconciler()
		Expect(reconciler.reconcileConditionsInitializing(ctx, server)).To(Succeed())
		server.Status.LastResolvedEndpoint = "http://a2a-server.default.svc.cluster.local:80/stale"

		resolved := reconciler.resolveEndpoint(server, address, grpcOnlyCard("grpc://a2a-server.default.svc.cluster.local:50051"))
		Expect(resolved.Reason).To(Equal(arka2a.ReasonUnsupportedTransport))
		Expect(reconciler.reconcileEndpoint(ctx, server, resolved)).To(Succeed())

		Expect(server.Status.LastResolvedEndpoint).To(Equal(address))
		Expect(server.Status.RejectedEndpoint).To(BeEmpty())

		condition := findCondition(server, A2AServerEndpointOverride)
		Expect(condition).NotTo(BeNil())
		Expect(condition.Status).To(Equal(metav1.ConditionFalse))
		Expect(condition.Reason).To(Equal(arka2a.ReasonUnsupportedTransport))
		Expect(condition.Message).To(ContainSubstring("GRPC"))
		Expect(findCondition(server, A2AServerReady).Reason).To(Equal("Initializing"))

		By("staying stable when the transport is still unsupported")
		Expect(reconciler.reconcileEndpoint(ctx, server, resolved)).To(Succeed())
		Expect(findCondition(server, A2AServerEndpointOverride).Reason).To(Equal(arka2a.ReasonUnsupportedTransport))
	})

	It("prefers a json-rpc additional interface when the preferred transport is not json-rpc", func() {
		server := createServer("endpoint-additional-interface", arkv1prealpha1.A2AServerSpec{
			EndpointResolution: arka2a.EndpointResolutionCardPath,
		})
		card := grpcOnlyCard("grpc://a2a-server.default.svc.cluster.local:50051")
		card.AdditionalInterfaces = []a2asrv.AgentInterface{{URL: "http://localhost:8000/rpc", Transport: "JSONRPC"}}

		resolved := newReconciler().resolveEndpoint(server, address, card)
		Expect(resolved.Reason).To(BeEmpty())
		Expect(resolved.URL).To(Equal("http://a2a-server.default.svc.cluster.local:80/rpc"))
	})

	It("updates an existing agent when only the endpoint annotation changed", func() {
		server := createServer("endpoint-agent-annotation", arkv1prealpha1.A2AServerSpec{})
		reconciler := newReconciler()
		card := &arka2a.A2AAgentCard{Name: "weather", Description: "weather agent"}

		server.Status.LastResolvedEndpoint = address
		agentName := reconciler.sanitizeAgentName(card.Name)
		created, err := reconciler.createOrUpdateAgent(ctx, reconciler.buildAgentWithSkills(server, card, agentName), agentName, server.Name)
		Expect(err).NotTo(HaveOccurred())
		Expect(created).To(BeTrue())
		DeferCleanup(func() {
			agent := &arkv1alpha1.Agent{}
			agent.Name = agentName
			agent.Namespace = server.Namespace
			Expect(client.IgnoreNotFound(k8sClient.Delete(ctx, agent))).To(Succeed())
		})

		server.Status.LastResolvedEndpoint = address + "/rpc"
		changed, err := reconciler.createOrUpdateAgent(ctx, reconciler.buildAgentWithSkills(server, card, agentName), agentName, server.Name)
		Expect(err).NotTo(HaveOccurred())
		Expect(changed).To(BeTrue())

		agent := &arkv1alpha1.Agent{}
		Expect(k8sClient.Get(ctx, types.NamespacedName{Name: agentName, Namespace: server.Namespace}, agent)).To(Succeed())
		Expect(agent.Annotations[annotations.A2AServerAddress]).To(Equal(address + "/rpc"))

		By("not updating when nothing changed")
		changed, err = reconciler.createOrUpdateAgent(ctx, reconciler.buildAgentWithSkills(server, card, agentName), agentName, server.Name)
		Expect(err).NotTo(HaveOccurred())
		Expect(changed).To(BeFalse())
	})
})
