/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"fmt"
	"time"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/builder"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	"sigs.k8s.io/controller-runtime/pkg/handler"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
	"sigs.k8s.io/controller-runtime/pkg/predicate"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/labels"
	"mckinsey.com/ark/internal/telemetry/routing"
)

// defaultMemoryName is the Memory name the broker chart creates and this
// backstop looks for. NewMemoryForQuery (executors/completions/memory.go)
// hardcodes the same name when a Query has no spec.memory.
const defaultMemoryName = "default"

// brokerSettleDelay is how long a broker-presence ConfigMap must exist
// before this backstop will create a Memory for it. The broker chart's own
// memory.yaml renders a `Memory/default` manifest in the SAME helm install
// that creates ark-config-broker/ark-config-streaming, applied a few
// resources later in Helm's kind-sorted apply order; a Kubernetes Create is
// exclusive, so reacting to the ConfigMap the instant it appears races that
// install and — confirmed empirically against the Helm version this repo's
// CI pins — reliably wins, which makes Helm's own Create fail with
// "already exists" and the whole `helm install ark-broker` fails. Waiting
// out a window far longer than any realistic helm install for this chart
// lets that install finish and create its own Memory first; this backstop
// then finds it already there and does nothing, exactly as intended.
const brokerSettleDelay = 30 * time.Second

// brokerServiceSelector matches the Service the broker chart creates. The
// broker announces itself for memory purposes through ark-config-broker or
// ark-config-streaming, but those ConfigMaps are rendered only when
// otelEndpoint.enabled / streaming.enabled are set — both default true, both
// independently disablable. A broker installed purely for message and session
// storage therefore has no ConfigMap, and keying presence on the ConfigMaps
// alone left #2731's invariant unenforced in exactly that configuration while
// the tenant chart's own preflight (which looks for the Service) was happy.
// The label is the chart's, not the release's, so it survives a renamed
// release where a hardcoded Service name would not. `nameOverride` does change
// it and the fallback stops matching then; the ConfigMap path is what covers a
// renamed chart.
const (
	brokerServiceNameLabel = "app.kubernetes.io/name"
	brokerServiceNameValue = "ark-broker"
)

func brokerServiceSelector() client.MatchingLabels {
	return client.MatchingLabels{brokerServiceNameLabel: brokerServiceNameValue}
}

// brokerServicePortName is the port name the broker chart's Service uses, and
// what the ConfigMap's serviceRef carries. Needed only on the Service
// fallback, where there is no ConfigMap to read it from.
const brokerServicePortName = "http"

// brokerSignal is the object that told us a broker is here, plus the Service
// the Memory should point at. The announcing object owns the Memory, so
// whatever removes the broker garbage-collects it: `helm uninstall` deletes
// the ConfigMap and the Service alike.
type brokerSignal struct {
	owner      client.Object
	serviceRef routing.ServiceRef
}

// DefaultMemoryReconciler is the controller-side backstop for the #2731
// invariant: every namespace with a broker has a `default` Memory pointing
// at it. The broker chart creates one on every install it controls, but a
// hand-rolled `helm install` (or a GitOps sync with
// memory.createMemoryCRD=false), or an operator deleting the resource
// afterwards, leaves the namespace uncovered — NewMemoryForQuery falls back
// to NoopMemory rather than failing, so the gap only shows up as missing
// conversation history (#2642).
//
// The tenant chart cannot own this Memory instead: NewHTTPMemory
// (executors/completions/memory_http.go) errors when
// status.lastResolvedAddress is empty, so a Memory created before the broker
// exists turns a silent degradation into failing queries. This reconciler
// only acts once it can see a broker presence signal, and only creates —
// never patches — so it never fights a Helm-owned object.
type DefaultMemoryReconciler struct {
	client.Client
	Scheme *runtime.Scheme
	// AutoProvision gates the whole reconciler: false makes Reconcile a
	// no-op. Creating resources in namespaces this controller did not
	// provision is the price of enforcing the invariant on hand-rolled Helm
	// or GitOps installs.
	AutoProvision bool
}

// +kubebuilder:rbac:groups=ark.mckinsey.com,resources=memories,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups="",resources=configmaps,verbs=get;list;watch
// +kubebuilder:rbac:groups="",resources=services,verbs=get;list;watch

// Reconcile is keyed by namespace only: req.Name is never read, because the
// trigger may be either broker-presence ConfigMap, the broker Service, or the
// Memory itself, and all of them mean the same thing — re-resolve this
// namespace from scratch.
func (r *DefaultMemoryReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := logf.FromContext(ctx)

	if !r.AutoProvision {
		return ctrl.Result{}, nil
	}

	// A namespace-scoped completions/controller pod only has RBAC for its
	// own namespace (see routing.DiscoveryNamespace's doc); a cluster-wide
	// watch that slips a request through for another namespace must not
	// attempt to read or write there.
	if ns := routing.DiscoveryNamespace(); ns != "" && req.Namespace != ns {
		return ctrl.Result{}, nil
	}

	signal, err := r.findBrokerSignal(ctx, req.Namespace)
	if err != nil {
		log.Error(err, "failed to resolve broker presence", "namespace", req.Namespace)
		return ctrl.Result{}, err
	}
	if signal == nil {
		// No broker signal in this namespace: no broker means no Memory.
		// Creating one here would point at a Service that may never exist,
		// turning NewHTTPMemory's silent degradation into failing queries.
		return ctrl.Result{}, nil
	}

	var existing arkv1alpha1.Memory
	getErr := r.Get(ctx, types.NamespacedName{Name: defaultMemoryName, Namespace: req.Namespace}, &existing)
	if getErr == nil {
		// Already present. This is a backstop, not an owner: a Helm-owned
		// Memory carries release annotations, and patching it here would
		// drift on every helm upgrade.
		return ctrl.Result{}, nil
	}
	if !apierrors.IsNotFound(getErr) {
		return ctrl.Result{}, getErr
	}

	serviceNamespace := req.Namespace
	if signal.serviceRef.Namespace != "" {
		serviceNamespace = signal.serviceRef.Namespace
	}

	// The Service has to be there before the Memory is. A ConfigMap can
	// outlive the Service it names — a partial teardown, or a GitOps prune
	// that removes the Deployment and Service first — and a Memory whose
	// address never resolves makes NewHTTPMemory error, so every query in the
	// namespace that would have quietly lost its history fails outright
	// instead. That inversion is the thing #2731 exists to prevent, so wait
	// rather than create.
	var svc corev1.Service
	svcKey := types.NamespacedName{Name: signal.serviceRef.Name, Namespace: serviceNamespace}
	if err := r.Get(ctx, svcKey, &svc); err != nil {
		if apierrors.IsNotFound(err) {
			log.V(1).Info("broker announced but its Service is absent; not creating a Memory that cannot resolve",
				"namespace", req.Namespace, "service", svcKey.String())
			return ctrl.Result{RequeueAfter: brokerSettleDelay}, nil
		}
		return ctrl.Result{}, err
	}

	// Anchored on the newest object the broker install has produced, not just
	// the announcing one. Keying it on the ConfigMap alone is not enough: a
	// ConfigMap applied well before the install — CI pre-creates one, and a
	// GitOps repo can hold one indefinitely — leaves the window long expired by
	// the time Helm runs, so reacting to the Service appearing mid-install
	// creates the Memory a moment before Helm creates its own and fails the
	// whole release. A Service that has only just appeared is itself evidence
	// that an install is in flight.
	if age := time.Since(newestCreation(signal.owner, &svc)); age < brokerSettleDelay {
		return ctrl.Result{RequeueAfter: brokerSettleDelay - age}, nil
	}

	memory := &arkv1alpha1.Memory{
		ObjectMeta: metav1.ObjectMeta{
			Name:      defaultMemoryName,
			Namespace: req.Namespace,
			Labels: map[string]string{
				labels.ManagedBy: labels.ManagedByController,
			},
		},
		Spec: arkv1alpha1.MemorySpec{
			Address: arkv1alpha1.ValueSource{
				ValueFrom: &arkv1alpha1.ValueFromSource{
					ServiceRef: &arkv1alpha1.ServiceReference{
						Name:      signal.serviceRef.Name,
						Namespace: serviceNamespace,
						Port:      signal.serviceRef.Port,
					},
				},
			},
		},
	}

	// Owning whichever object announced the broker removes the need for
	// cleanup code: a `helm uninstall` deletes the ConfigMap and the Service
	// alike, and Kubernetes garbage-collects the Memory alongside it.
	if err := controllerutil.SetControllerReference(signal.owner, memory, r.Scheme); err != nil {
		return ctrl.Result{}, err
	}

	if err := r.Create(ctx, memory); err != nil {
		if apierrors.IsAlreadyExists(err) {
			// Raced with Helm (or another reconcile) creating it first.
			return ctrl.Result{}, nil
		}
		return ctrl.Result{}, err
	}

	log.Info("created default Memory backstop",
		"namespace", req.Namespace,
		"announcedBy", fmt.Sprintf("%T/%s", signal.owner, signal.owner.GetName()))
	return ctrl.Result{}, nil
}

// newestCreation returns the most recent creation timestamp among objs, which
// is when the broker's install last did something observable here.
func newestCreation(objs ...client.Object) time.Time {
	var newest time.Time
	for _, obj := range objs {
		if t := obj.GetCreationTimestamp().Time; t.After(newest) {
			newest = t
		}
	}
	return newest
}

// findBrokerSignal reports how this namespace announces a broker, preferring
// the ConfigMap because it carries an explicit serviceRef (including one that
// points at a broker in another namespace). The Service fallback covers a
// broker installed with both telemetry ConfigMaps disabled; it assumes the
// Service is in this namespace, which is what a per-namespace broker install
// produces.
func (r *DefaultMemoryReconciler) findBrokerSignal(ctx context.Context, namespace string) (*brokerSignal, error) {
	cm, serviceRef, err := routing.BrokerServiceRefFor(ctx, r.Client, namespace)
	if err != nil {
		return nil, err
	}
	if serviceRef != nil {
		return &brokerSignal{owner: cm, serviceRef: *serviceRef}, nil
	}

	var services corev1.ServiceList
	if err := r.List(ctx, &services, client.InNamespace(namespace), brokerServiceSelector()); err != nil {
		return nil, err
	}
	if len(services.Items) == 0 {
		return nil, nil
	}

	// More than one match means more than one broker release in the namespace,
	// which the invariant does not describe. Pick deterministically by name so
	// repeated reconciles agree.
	chosen := services.Items[0]
	for i := range services.Items {
		if services.Items[i].Name < chosen.Name {
			chosen = services.Items[i]
		}
	}
	return &brokerSignal{
		owner:      &chosen,
		serviceRef: routing.ServiceRef{Name: chosen.Name, Port: brokerServicePortName},
	}, nil
}

// isBrokerPresenceConfigMap and isBrokerService are the watch filters, and
// namespaceRequest is the mapping. They are named rather than inlined into
// SetupWithManager so they can be tested: a manager-wiring function is not
// reachable from a unit test, and while they lived inside it, deleting the
// Service watch outright left the whole suite green.
func isBrokerPresenceConfigMap(obj client.Object) bool {
	return routing.IsBrokerPresenceConfigMapName(obj.GetName())
}

func isBrokerService(obj client.Object) bool {
	return obj.GetLabels()[brokerServiceNameLabel] == brokerServiceNameValue
}

// namespaceRequest keys a reconcile on the triggering object's namespace only;
// Reconcile ignores req.Name and re-resolves the signal from scratch.
func namespaceRequest(_ context.Context, obj client.Object) []reconcile.Request {
	return []reconcile.Request{{
		NamespacedName: types.NamespacedName{Namespace: obj.GetNamespace()},
	}}
}

// SetupWithManager sets up the controller with the Manager.
func (r *DefaultMemoryReconciler) SetupWithManager(mgr ctrl.Manager) error {
	brokerPresenceConfigMap := predicate.NewPredicateFuncs(isBrokerPresenceConfigMap)
	brokerService := predicate.NewPredicateFuncs(isBrokerService)
	toNamespace := handler.EnqueueRequestsFromMapFunc(namespaceRequest)

	return ctrl.NewControllerManagedBy(mgr).
		For(&corev1.ConfigMap{}, builder.WithPredicates(predicate.And(brokerPresenceConfigMap, dataChangedPredicate()))).
		Watches(&corev1.Service{}, toNamespace, builder.WithPredicates(brokerService)).
		// Owns() derives its owner type from For(), so it only maps a Memory
		// back when the ConfigMap announced the broker. A Service-owned Memory
		// needs its own owner watch, or deleting one on the Service path goes
		// unnoticed until the cache resync — losing the self-heal on exactly
		// the configuration the Service fallback exists for.
		Owns(&arkv1alpha1.Memory{}).
		Watches(&arkv1alpha1.Memory{}, handler.EnqueueRequestForOwner(
			mgr.GetScheme(), mgr.GetRESTMapper(), &corev1.Service{}, handler.OnlyControllerOwner(),
		)).
		Named("defaultmemory").
		Complete(r)
}
