/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"fmt"
	"sync/atomic"
	"time"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes/scheme"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/builder"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/handler"
	"sigs.k8s.io/controller-runtime/pkg/manager"
	metricsserver "sigs.k8s.io/controller-runtime/pkg/metrics/server"
	"sigs.k8s.io/controller-runtime/pkg/predicate"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/labels"
)

// countingReconciler exposes the production label-driven Secret watch
// wiring against an MCPServer reconciler whose Reconcile only counts
// invocations. Lets the envtest assert "labelled Secret patch enqueues
// reconcile / unlabelled does not" without tying the test to the full
// MCP discovery path.
type countingReconciler struct {
	client.Client
	requests atomic.Int32
	seen     chan reconcile.Request
	name     string
}

func (r *countingReconciler) Reconcile(_ context.Context, req reconcile.Request) (reconcile.Result, error) {
	r.requests.Add(1)
	select {
	case r.seen <- req:
	default:
	}
	return reconcile.Result{}, nil
}

func (r *countingReconciler) findMCPServersForSecret(ctx context.Context, obj client.Object) []reconcile.Request {
	var mcpServers arkv1alpha1.MCPServerList
	if err := r.List(ctx, &mcpServers,
		client.InNamespace(obj.GetNamespace()),
		client.MatchingFields{mcpTokenSecretRefField: obj.GetName()},
	); err != nil {
		return nil
	}
	out := make([]reconcile.Request, 0, len(mcpServers.Items))
	for i := range mcpServers.Items {
		out = append(out, reconcile.Request{
			NamespacedName: types.NamespacedName{
				Name:      mcpServers.Items[i].Name,
				Namespace: mcpServers.Items[i].Namespace,
			},
		})
	}
	return out
}

func (r *countingReconciler) SetupWithManager(mgr ctrl.Manager) error {
	if err := mgr.GetFieldIndexer().IndexField(context.Background(), &arkv1alpha1.MCPServer{}, mcpTokenSecretRefField, mcpTokenSecretRefIndexer); err != nil {
		return err
	}
	return ctrl.NewControllerManagedBy(mgr).
		For(&arkv1alpha1.MCPServer{}).
		Watches(
			&corev1.Secret{},
			handler.EnqueueRequestsFromMapFunc(r.findMCPServersForSecret),
			builder.WithPredicates(predicate.NewPredicateFuncs(hasMCPTokenSecretLabel)),
		).
		Named(r.name).
		Complete(r)
}

// drainSeen reads all currently-buffered Reconcile requests so a
// follow-up assertion only counts new events.
func drainSeen(ch chan reconcile.Request) {
	for {
		select {
		case <-ch:
		default:
			return
		}
	}
}

var watchTestCounter atomic.Int32

var _ = Describe("MCPServer Controller — token Secret watch", func() {
	var (
		mgr        manager.Manager
		mgrCtx     context.Context
		mgrCancel  context.CancelFunc
		reconciler *countingReconciler
		ns         = "default"
	)

	BeforeEach(func() {
		var err error
		mgr, err = ctrl.NewManager(cfg, ctrl.Options{
			Scheme: scheme.Scheme,
			// Disable metrics + health endpoints so parallel test
			// invocations do not collide on default ports.
			Metrics:                metricsserver.Options{BindAddress: "0"},
			HealthProbeBindAddress: "0",
		})
		Expect(err).NotTo(HaveOccurred())

		reconciler = &countingReconciler{
			Client: mgr.GetClient(),
			seen:   make(chan reconcile.Request, 32),
			name:   fmt.Sprintf("mcpserver-secret-watch-test-%d", watchTestCounter.Add(1)),
		}
		Expect(reconciler.SetupWithManager(mgr)).To(Succeed())

		mgrCtx, mgrCancel = context.WithCancel(context.Background())
		go func() {
			defer GinkgoRecover()
			Expect(mgr.Start(mgrCtx)).To(Succeed())
		}()

		Expect(mgr.GetCache().WaitForCacheSync(mgrCtx)).To(BeTrue())
	})

	AfterEach(func() {
		mgrCancel()
	})

	It("enqueues a reconcile when a labelled token Secret is patched", func() {
		const mcpName = "mcp-watch-labelled"
		const secretName = "mcp-watch-labelled-secret"

		secret := &corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{
				Name:      secretName,
				Namespace: ns,
				Labels:    map[string]string{labels.MCPTokenSecretLabel: "true"},
			},
			Data: map[string][]byte{"access_token": []byte("v1")},
		}
		Expect(k8sClient.Create(mgrCtx, secret)).To(Succeed())
		DeferCleanup(func() { _ = k8sClient.Delete(context.Background(), secret) })

		mcp := &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: mcpName, Namespace: ns},
			Spec: arkv1alpha1.MCPServerSpec{
				Address:   arkv1alpha1.ValueSource{Value: "http://example.invalid/mcp"},
				Transport: "http",
				Authorization: &arkv1alpha1.MCPServerAuthorizationSpec{
					TokenSecretRef: arkv1alpha1.TokenSecretReference{Name: secretName},
				},
			},
		}
		Expect(k8sClient.Create(mgrCtx, mcp)).To(Succeed())
		DeferCleanup(func() { _ = k8sClient.Delete(context.Background(), mcp) })

		// Wait for the create-driven reconcile to flush, then snapshot.
		Eventually(func() int32 { return reconciler.requests.Load() }, 5*time.Second, 50*time.Millisecond).Should(BeNumerically(">=", 1))
		drainSeen(reconciler.seen)
		baseline := reconciler.requests.Load()

		// Patch the Secret — labelled, so the watch must fire.
		patch := client.MergeFrom(secret.DeepCopy())
		secret.Data["access_token"] = []byte("v2")
		Expect(k8sClient.Patch(mgrCtx, secret, patch)).To(Succeed())

		Eventually(func() int32 { return reconciler.requests.Load() }, 5*time.Second, 50*time.Millisecond).Should(BeNumerically(">", baseline))

		// Confirm one of the new reconciles targets our MCPServer.
		Eventually(reconciler.seen, 5*time.Second, 50*time.Millisecond).Should(Receive(Equal(reconcile.Request{
			NamespacedName: types.NamespacedName{Name: mcpName, Namespace: ns},
		})))
	})

	It("does NOT enqueue an event-driven reconcile when an unlabelled token Secret is patched", func() {
		const mcpName = "mcp-watch-unlabelled"
		const secretName = "mcp-watch-unlabelled-secret"

		secret := &corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{Name: secretName, Namespace: ns},
			Data:       map[string][]byte{"access_token": []byte("v1")},
		}
		Expect(k8sClient.Create(mgrCtx, secret)).To(Succeed())
		DeferCleanup(func() { _ = k8sClient.Delete(context.Background(), secret) })

		mcp := &arkv1alpha1.MCPServer{
			ObjectMeta: metav1.ObjectMeta{Name: mcpName, Namespace: ns},
			Spec: arkv1alpha1.MCPServerSpec{
				Address:   arkv1alpha1.ValueSource{Value: "http://example.invalid/mcp"},
				Transport: "http",
				Authorization: &arkv1alpha1.MCPServerAuthorizationSpec{
					TokenSecretRef: arkv1alpha1.TokenSecretReference{Name: secretName},
				},
			},
		}
		Expect(k8sClient.Create(mgrCtx, mcp)).To(Succeed())
		DeferCleanup(func() { _ = k8sClient.Delete(context.Background(), mcp) })

		Eventually(func() int32 { return reconciler.requests.Load() }, 5*time.Second, 50*time.Millisecond).Should(BeNumerically(">=", 1))
		drainSeen(reconciler.seen)
		baseline := reconciler.requests.Load()

		patch := client.MergeFrom(secret.DeepCopy())
		secret.Data["access_token"] = []byte("v2")
		Expect(k8sClient.Patch(mgrCtx, secret, patch)).To(Succeed())

		// No label → predicate filters the event before the map func
		// runs, so the counter must NOT increase within the window.
		Consistently(func() int32 { return reconciler.requests.Load() }, 2*time.Second, 50*time.Millisecond).Should(Equal(baseline))
	})

	It("enqueues a reconcile for every MCPServer referencing the same labelled Secret", func() {
		const secretName = "mcp-watch-shared-secret"
		const mcpA = "mcp-watch-shared-a"
		const mcpB = "mcp-watch-shared-b"

		secret := &corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{
				Name:      secretName,
				Namespace: ns,
				Labels:    map[string]string{labels.MCPTokenSecretLabel: "true"},
			},
			Data: map[string][]byte{"access_token": []byte("v1")},
		}
		Expect(k8sClient.Create(mgrCtx, secret)).To(Succeed())
		DeferCleanup(func() { _ = k8sClient.Delete(context.Background(), secret) })

		for _, name := range []string{mcpA, mcpB} {
			mcp := &arkv1alpha1.MCPServer{
				ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: ns},
				Spec: arkv1alpha1.MCPServerSpec{
					Address:   arkv1alpha1.ValueSource{Value: "http://example.invalid/mcp"},
					Transport: "http",
					Authorization: &arkv1alpha1.MCPServerAuthorizationSpec{
						TokenSecretRef: arkv1alpha1.TokenSecretReference{Name: secretName},
					},
				},
			}
			Expect(k8sClient.Create(mgrCtx, mcp)).To(Succeed())
			n := name
			DeferCleanup(func() {
				_ = k8sClient.Delete(context.Background(), &arkv1alpha1.MCPServer{
					ObjectMeta: metav1.ObjectMeta{Name: n, Namespace: ns},
				})
			})
		}

		Eventually(func() int32 { return reconciler.requests.Load() }, 5*time.Second, 50*time.Millisecond).Should(BeNumerically(">=", 2))
		drainSeen(reconciler.seen)

		patch := client.MergeFrom(secret.DeepCopy())
		secret.Data["access_token"] = []byte("v2")
		Expect(k8sClient.Patch(mgrCtx, secret, patch)).To(Succeed())

		seenNames := map[string]bool{}
		Eventually(func() map[string]bool {
			for {
				select {
				case req := <-reconciler.seen:
					seenNames[req.Name] = true
				default:
					return seenNames
				}
			}
		}, 5*time.Second, 50*time.Millisecond).Should(And(HaveKey(mcpA), HaveKey(mcpB)))
	})
})
