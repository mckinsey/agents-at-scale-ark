/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/builder"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
	"sigs.k8s.io/controller-runtime/pkg/predicate"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/labels"
	"mckinsey.com/ark/internal/telemetry/routing"
)

// defaultMemoryName is the Memory name the broker chart creates and this
// backstop looks for. NewMemoryForQuery (executors/completions/memory.go)
// hardcodes the same name when a Query has no spec.memory.
const defaultMemoryName = "default"

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

// Reconcile is keyed by the namespace of a ConfigMap named ark-config-broker
// or ark-config-streaming (req.Name is not used — either ConfigMap in a
// namespace is the same presence signal).
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

	cmName, serviceRef, err := routing.BrokerServiceRefFor(ctx, r.Client, req.Namespace)
	if err != nil {
		log.Error(err, "failed to resolve broker presence", "namespace", req.Namespace)
		return ctrl.Result{}, err
	}
	if serviceRef == nil {
		// No enabled broker signal in this namespace: no broker means no
		// Memory. Creating one here would point at a Service that may never
		// exist, turning NewHTTPMemory's silent degradation into failing
		// queries.
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

	var cm corev1.ConfigMap
	if err := r.Get(ctx, types.NamespacedName{Name: cmName, Namespace: req.Namespace}, &cm); err != nil {
		// The ConfigMap that gave us the signal disappeared between the two
		// Gets; the next reconcile (triggered by that deletion) resolves.
		return ctrl.Result{}, client.IgnoreNotFound(err)
	}

	serviceNamespace := req.Namespace
	if serviceRef.Namespace != "" {
		serviceNamespace = serviceRef.Namespace
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
						Name:      serviceRef.Name,
						Namespace: serviceNamespace,
						Port:      serviceRef.Port,
					},
				},
			},
		},
	}

	// Owning the ConfigMap removes the need for cleanup code: a
	// `helm uninstall` deletes it, and Kubernetes garbage-collects the
	// Memory this controller created alongside it.
	if err := controllerutil.SetControllerReference(&cm, memory, r.Scheme); err != nil {
		return ctrl.Result{}, err
	}

	if err := r.Create(ctx, memory); err != nil {
		if apierrors.IsAlreadyExists(err) {
			// Raced with Helm (or another reconcile) creating it first.
			return ctrl.Result{}, nil
		}
		return ctrl.Result{}, err
	}

	log.Info("created default Memory backstop", "namespace", req.Namespace, "configMap", cmName)
	return ctrl.Result{}, nil
}

// SetupWithManager sets up the controller with the Manager.
func (r *DefaultMemoryReconciler) SetupWithManager(mgr ctrl.Manager) error {
	brokerPresenceConfigMap := predicate.NewPredicateFuncs(func(obj client.Object) bool {
		return routing.IsBrokerPresenceConfigMapName(obj.GetName())
	})

	return ctrl.NewControllerManagedBy(mgr).
		For(&corev1.ConfigMap{}, builder.WithPredicates(brokerPresenceConfigMap)).
		Owns(&arkv1alpha1.Memory{}).
		Named("defaultmemory").
		Complete(r)
}
