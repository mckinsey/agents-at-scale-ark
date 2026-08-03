/* Copyright 2025. McKinsey & Company */

package apiserver

import (
	"context"

	"k8s.io/apiserver/pkg/admission"
	"k8s.io/client-go/informers"
	"k8s.io/client-go/tools/cache"
	"k8s.io/klog/v2"
)

// Upstream plugin names; the decorator matches on these so it wraps only the admission we own
// the degradation story for, and leaves the rest of the chain alone.
const (
	validatingAdmissionPolicyPlugin  = "ValidatingAdmissionPolicy"
	validatingAdmissionWebhookPlugin = "ValidatingAdmissionWebhook"
	mutatingAdmissionWebhookPlugin   = "MutatingAdmissionWebhook"
)

// readinessGate approximates whether an admission plugin can actually evaluate.
//
// It is an approximation on purpose. Each plugin gates on its own ready func — the policy plugin
// on its namespace informer plus its policy source, the webhook plugins on their configuration
// managers — and from outside we can only see the informers' HasSynced. The two can disagree, so
// callers must treat "unsure" as not ready: a false negative skips enforcement for one request,
// while a false positive means the request enters the plugin, blocks in WaitForReady for 10s,
// and is then rejected with Forbidden — the failure this exists to prevent.
type readinessGate struct {
	synced []cache.InformerSynced
}

func (g *readinessGate) ready() bool {
	for _, hasSynced := range g.synced {
		if !hasSynced() {
			return false
		}
	}
	return true
}

// newPolicyReadinessGate registers the informers the CEL policy plugin depends on. Registering
// them on the shared factory is what the plugin's own initializer does, so these are the same
// instances.
func newPolicyReadinessGate(f informers.SharedInformerFactory) *readinessGate {
	return &readinessGate{synced: []cache.InformerSynced{
		f.Admissionregistration().V1().ValidatingAdmissionPolicies().Informer().HasSynced,
		f.Admissionregistration().V1().ValidatingAdmissionPolicyBindings().Informer().HasSynced,
		f.Core().V1().Namespaces().Informer().HasSynced,
	}}
}

// newWebhookReadinessGate registers the informers the webhook plugins depend on to know which
// webhooks to call. Namespaces are included because webhook matching evaluates namespaceSelector.
func newWebhookReadinessGate(f informers.SharedInformerFactory) *readinessGate {
	return &readinessGate{synced: []cache.InformerSynced{
		f.Admissionregistration().V1().ValidatingWebhookConfigurations().Informer().HasSynced,
		f.Admissionregistration().V1().MutatingWebhookConfigurations().Informer().HasSynced,
		f.Core().V1().Namespaces().Informer().HasSynced,
	}}
}

// bestEffortDecorator makes policy.required=false mean at runtime what it already means at
// startup. Upstream does not degrade when a plugin's informers stall — it fails closed, per
// request, after a 10s wait. That is correct for required=true, where the operator has declared
// policy a control and the plugins are left unwrapped. It contradicts required=false, which
// promises the apiserver keeps serving with enforcement off.
//
// Append this to AdmissionOptions.Decorators rather than replacing the slice: NewAdmissionOptions
// seeds it with WithControllerMetrics, and overwriting it drops the admission metrics.
//
// The wrapper type is chosen by what the plugin actually implements. A plugin that only validates
// must not come back also implementing MutationInterface — the chain type-asserts to decide what
// to call, so widening a plugin's interface would silently add it to the mutation phase.
func bestEffortDecorator(gates map[string]*readinessGate) admission.Decorator {
	return admission.DecoratorFunc(func(handler admission.Interface, name string) admission.Interface {
		gate, watched := gates[name]
		if !watched {
			return handler
		}
		mutator, mutates := handler.(admission.MutationInterface)
		validator, validates := handler.(admission.ValidationInterface)
		base := bestEffortBase{gate: gate, plugin: name}
		switch {
		case mutates && validates:
			return &bestEffortMutatingValidatingHandler{bestEffortBase: base, mutator: mutator, validator: validator}
		case mutates:
			return &bestEffortMutatingHandler{bestEffortBase: base, MutationInterface: mutator}
		case validates:
			return &bestEffortValidatingHandler{bestEffortBase: base, ValidationInterface: validator}
		default:
			return handler
		}
	})
}

type bestEffortBase struct {
	gate   *readinessGate
	plugin string
}

// skip reports whether to admit without consulting the plugin, and says so once per request at a
// verbosity that is off by default — the metric is the signal meant for alerting.
func (b bestEffortBase) skip(a admission.Attributes) bool {
	if b.gate.ready() {
		return false
	}
	klog.V(2).InfoS("Admitting without evaluating an admission plugin: its informers have not synced (policy.required=false)",
		"plugin", b.plugin, "resource", a.GetResource().String(), "operation", a.GetOperation(),
		"namespace", a.GetNamespace(), "name", a.GetName())
	return true
}

type bestEffortValidatingHandler struct {
	bestEffortBase
	admission.ValidationInterface
}

func (h *bestEffortValidatingHandler) Validate(ctx context.Context, a admission.Attributes, o admission.ObjectInterfaces) error {
	if h.skip(a) {
		return nil
	}
	return h.ValidationInterface.Validate(ctx, a, o)
}

type bestEffortMutatingHandler struct {
	bestEffortBase
	admission.MutationInterface
}

func (h *bestEffortMutatingHandler) Admit(ctx context.Context, a admission.Attributes, o admission.ObjectInterfaces) error {
	if h.skip(a) {
		return nil
	}
	return h.MutationInterface.Admit(ctx, a, o)
}

type bestEffortMutatingValidatingHandler struct {
	bestEffortBase
	mutator   admission.MutationInterface
	validator admission.ValidationInterface
}

func (h *bestEffortMutatingValidatingHandler) Handles(op admission.Operation) bool {
	return h.mutator.Handles(op)
}

func (h *bestEffortMutatingValidatingHandler) Admit(ctx context.Context, a admission.Attributes, o admission.ObjectInterfaces) error {
	if h.skip(a) {
		return nil
	}
	return h.mutator.Admit(ctx, a, o)
}

func (h *bestEffortMutatingValidatingHandler) Validate(ctx context.Context, a admission.Attributes, o admission.ObjectInterfaces) error {
	if h.skip(a) {
		return nil
	}
	return h.validator.Validate(ctx, a, o)
}
