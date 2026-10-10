/* Copyright 2025. McKinsey & Company */

package apiserver

import (
	"context"
	"errors"
	"testing"

	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apiserver/pkg/admission"
	genericoptions "k8s.io/apiserver/pkg/server/options"
	"k8s.io/client-go/informers"
	"k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/tools/cache"
)

// testAttributes mirrors what the admission chain actually hands a plugin; the handler reads
// several fields for its log line, so a nil Attributes would not exercise the real path.
func testAttributes() admission.Attributes {
	gv := schema.GroupVersion{Group: "ark.mckinsey.com", Version: "v1alpha1"}
	return admission.NewAttributesRecord(
		nil, nil,
		gv.WithKind("Agent"),
		"team-a", "a1",
		gv.WithResource("agents"),
		"", admission.Create, nil, false, nil,
	)
}

func gateWith(synced ...bool) *readinessGate {
	checks := make([]cache.InformerSynced, 0, len(synced))
	for _, s := range synced {
		checks = append(checks, func() bool { return s })
	}
	return &readinessGate{synced: checks}
}

func TestReadinessGate_RequiresEveryInformer(t *testing.T) {
	t.Parallel()

	// All three watches are load-bearing: the plugin's ready func needs the namespace informer
	// as well as the policy source, so any one lagging must read as not ready.
	cases := []struct {
		name  string
		state []bool
		want  bool
	}{
		{name: "all synced", state: []bool{true, true, true}, want: true},
		{name: "policies lagging", state: []bool{false, true, true}, want: false},
		{name: "bindings lagging", state: []bool{true, false, true}, want: false},
		{name: "namespaces lagging", state: []bool{true, true, false}, want: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := gateWith(tc.state...).ready(); got != tc.want {
				t.Errorf("ready() = %v, want %v", got, tc.want)
			}
		})
	}
}

// stubValidator stands in for the upstream plugin and records whether it was reached.
type stubValidator struct {
	called bool
	err    error
}

func (s *stubValidator) Handles(admission.Operation) bool { return true }

func (s *stubValidator) Validate(context.Context, admission.Attributes, admission.ObjectInterfaces) error {
	s.called = true
	return s.err
}

// stubMutator stands in for a plugin that only mutates, as MutatingAdmissionWebhook does.
type stubMutator struct {
	called bool
	err    error
}

func (s *stubMutator) Handles(admission.Operation) bool { return true }

func (s *stubMutator) Admit(context.Context, admission.Attributes, admission.ObjectInterfaces) error {
	s.called = true
	return s.err
}

// stubMutatingValidator implements both phases, the shape a plugin registered for mutation and
// validation presents to the chain.
type stubMutatingValidator struct {
	admitted    bool
	validated   bool
	handlesOp   bool
	admitErr    error
	validateErr error
}

func (s *stubMutatingValidator) Handles(admission.Operation) bool { return s.handlesOp }

func (s *stubMutatingValidator) Admit(context.Context, admission.Attributes, admission.ObjectInterfaces) error {
	s.admitted = true
	return s.admitErr
}

func (s *stubMutatingValidator) Validate(context.Context, admission.Attributes, admission.ObjectInterfaces) error {
	s.validated = true
	return s.validateErr
}

// stubInert implements admission.Interface and neither phase, so the decorator has nothing to
// gate and must hand it back untouched.
type stubInert struct{}

func (stubInert) Handles(admission.Operation) bool { return true }

// The decorator must wrap only the VAP plugin; anything else in the chain passes through
// untouched, or the gate would suppress admission it knows nothing about.
func TestBestEffortDecorator_OnlyWrapsGatedPlugins(t *testing.T) {
	t.Parallel()

	decorator := bestEffortDecorator(map[string]*readinessGate{validatingAdmissionPolicyPlugin: gateWith(false)})
	inner := &stubValidator{}

	if got := decorator.Decorate(inner, "SomeOtherPlugin"); got != admission.Interface(inner) {
		t.Error("expected a non-VAP plugin to be returned unwrapped")
	}
	if got := decorator.Decorate(inner, validatingAdmissionPolicyPlugin); got == admission.Interface(inner) {
		t.Error("expected the VAP plugin to be wrapped")
	}
}

// Regression guard for the wiring in applyAdmission: NewAdmissionOptions seeds Decorators with
// WithControllerMetrics, so the gate must be appended. Assigning the slice would silently drop
// the admission metrics.
func TestAdmissionOptions_SeedsDecoratorsThatMustBePreserved(t *testing.T) {
	t.Parallel()

	opts := genericoptions.NewAdmissionOptions()
	seeded := len(opts.Decorators)
	if seeded == 0 {
		t.Fatal("expected upstream to seed at least one decorator (WithControllerMetrics); appending is no longer load-bearing if this changes")
	}

	opts.Decorators = append(opts.Decorators, bestEffortDecorator(map[string]*readinessGate{validatingAdmissionPolicyPlugin: gateWith(true)}))
	if len(opts.Decorators) != seeded+1 {
		t.Errorf("decorators = %d, want %d", len(opts.Decorators), seeded+1)
	}
}

// The decorator picks the wrapper type from what the plugin implements. Widening a plugin's
// interface silently enrols it in a phase it never registered for -- the chain type-asserts to
// decide what to call, so a validate-only plugin that comes back also implementing
// MutationInterface would start being invoked during mutation.
func TestBestEffortDecorator_PreservesPluginInterfaces(t *testing.T) {
	t.Parallel()

	decorator := bestEffortDecorator(map[string]*readinessGate{
		validatingAdmissionPolicyPlugin:  gateWith(true),
		validatingAdmissionWebhookPlugin: gateWith(true),
		mutatingAdmissionWebhookPlugin:   gateWith(true),
	})

	cases := []struct {
		name         string
		plugin       string
		inner        admission.Interface
		wantMutates  bool
		wantValidate bool
	}{
		{
			name:         "validate-only stays validate-only",
			plugin:       validatingAdmissionPolicyPlugin,
			inner:        &stubValidator{},
			wantMutates:  false,
			wantValidate: true,
		},
		{
			name:         "mutate-only stays mutate-only",
			plugin:       mutatingAdmissionWebhookPlugin,
			inner:        &stubMutator{},
			wantMutates:  true,
			wantValidate: false,
		},
		{
			name:         "both phases keep both",
			plugin:       validatingAdmissionWebhookPlugin,
			inner:        &stubMutatingValidator{},
			wantMutates:  true,
			wantValidate: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			wrapped := decorator.Decorate(tc.inner, tc.plugin)
			if wrapped == tc.inner {
				t.Fatal("expected a gated plugin to be wrapped")
			}
			if _, mutates := wrapped.(admission.MutationInterface); mutates != tc.wantMutates {
				t.Errorf("implements MutationInterface = %v, want %v", mutates, tc.wantMutates)
			}
			if _, validates := wrapped.(admission.ValidationInterface); validates != tc.wantValidate {
				t.Errorf("implements ValidationInterface = %v, want %v", validates, tc.wantValidate)
			}
		})
	}
}

// A plugin implementing neither phase has nothing to gate, so wrapping it would only add a type
// the chain has to reason about.
func TestBestEffortDecorator_LeavesInertPluginUnwrapped(t *testing.T) {
	t.Parallel()

	decorator := bestEffortDecorator(map[string]*readinessGate{mutatingAdmissionWebhookPlugin: gateWith(false)})
	inner := stubInert{}

	if got := decorator.Decorate(inner, mutatingAdmissionWebhookPlugin); got != admission.Interface(inner) {
		t.Error("expected a plugin implementing neither phase to be returned unwrapped")
	}
}

// Both phases gate independently on the same readiness, and neither may reach the plugin while
// its informers are lagging.
func TestBestEffortMutatingValidatingHandler_GatesBothPhases(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name          string
		synced        bool
		wantDelegated bool
	}{
		{name: "unsynced short-circuits both phases", synced: false, wantDelegated: false},
		{name: "synced delegates both phases", synced: true, wantDelegated: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			inner := &stubMutatingValidator{}
			h := &bestEffortMutatingValidatingHandler{
				bestEffortBase: bestEffortBase{gate: gateWith(tc.synced), plugin: validatingAdmissionWebhookPlugin},
				mutator:        inner,
				validator:      inner,
			}

			if err := h.Admit(context.Background(), testAttributes(), nil); err != nil {
				t.Errorf("Admit: expected the request to be admitted, got %v", err)
			}
			if err := h.Validate(context.Background(), testAttributes(), nil); err != nil {
				t.Errorf("Validate: expected the request to be admitted, got %v", err)
			}
			if inner.admitted != tc.wantDelegated {
				t.Errorf("mutation phase reached = %v, want %v", inner.admitted, tc.wantDelegated)
			}
			if inner.validated != tc.wantDelegated {
				t.Errorf("validation phase reached = %v, want %v", inner.validated, tc.wantDelegated)
			}
		})
	}
}

// Rejections from a plugin that did evaluate must still reach the client; the gate is about
// readiness, not about softening policy.
func TestBestEffortMutatingValidatingHandler_SurfacesRejections(t *testing.T) {
	t.Parallel()

	admitDenied := errors.New("denied during mutation")
	validateDenied := errors.New("denied during validation")

	inner := &stubMutatingValidator{admitErr: admitDenied, validateErr: validateDenied}
	h := &bestEffortMutatingValidatingHandler{
		bestEffortBase: bestEffortBase{gate: gateWith(true), plugin: validatingAdmissionWebhookPlugin},
		mutator:        inner,
		validator:      inner,
	}

	if err := h.Admit(context.Background(), testAttributes(), nil); !errors.Is(err, admitDenied) {
		t.Errorf("Admit: expected %v to surface, got %v", admitDenied, err)
	}
	if err := h.Validate(context.Background(), testAttributes(), nil); !errors.Is(err, validateDenied) {
		t.Errorf("Validate: expected %v to surface, got %v", validateDenied, err)
	}
}

// Handles decides whether the chain invokes the plugin at all. The wrapper embeds no interface it
// can inherit this from, so it must forward to the plugin rather than answer for it -- reporting
// true for an operation the plugin declined would invoke it out of contract, and false would drop
// enforcement for that operation entirely.
func TestBestEffortMutatingValidatingHandler_HandlesForwardsToPlugin(t *testing.T) {
	t.Parallel()

	for _, handles := range []bool{true, false} {
		inner := &stubMutatingValidator{handlesOp: handles}
		h := &bestEffortMutatingValidatingHandler{
			bestEffortBase: bestEffortBase{gate: gateWith(true), plugin: validatingAdmissionWebhookPlugin},
			mutator:        inner,
			validator:      inner,
		}

		if got := h.Handles(admission.Create); got != handles {
			t.Errorf("Handles(Create) = %v, want %v", got, handles)
		}
	}
}

// The gates must register the informers each plugin actually depends on. A gate that watches
// fewer would report ready while the plugin is not, which is the false positive that costs a
// 10s stall and a 403 rather than a skipped evaluation.
func TestReadinessGates_WatchEveryInformerTheirPluginNeeds(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		gate func(informers.SharedInformerFactory) *readinessGate
	}{
		{name: "policy", gate: newPolicyReadinessGate},
		{name: "webhook", gate: newWebhookReadinessGate},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			factory := informers.NewSharedInformerFactory(fake.NewSimpleClientset(), 0)
			gate := tc.gate(factory)

			// Two admissionregistration resources plus namespaces, which both plugins consult:
			// the policy plugin for its own ready func, the webhook plugins for namespaceSelector.
			if len(gate.synced) != 3 {
				t.Fatalf("registered %d informers, want 3", len(gate.synced))
			}
			if gate.ready() {
				t.Error("expected not ready before the factory is started")
			}

			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			factory.Start(ctx.Done())
			factory.WaitForCacheSync(ctx.Done())

			if !gate.ready() {
				t.Error("expected ready once every registered informer has synced")
			}
		})
	}
}

// The single-phase wrappers share one contract, so both are pinned by the same table: an unsynced
// plugin is bypassed rather than reached, and a synced one is delegated to verbatim -- including
// its rejections.
func TestBestEffortSinglePhaseHandlers(t *testing.T) {
	t.Parallel()

	denied := errors.New("denied by admission")

	// invoke builds the wrapper for one phase and returns whether the plugin was reached.
	phases := []struct {
		name   string
		invoke func(gate *readinessGate, innerErr error) (called bool, err error)
	}{
		{
			name: "validate",
			invoke: func(gate *readinessGate, innerErr error) (bool, error) {
				inner := &stubValidator{err: innerErr}
				h := &bestEffortValidatingHandler{
					bestEffortBase:      bestEffortBase{gate: gate, plugin: validatingAdmissionPolicyPlugin},
					ValidationInterface: inner,
				}
				err := h.Validate(context.Background(), testAttributes(), nil)
				return inner.called, err
			},
		},
		{
			name: "admit",
			invoke: func(gate *readinessGate, innerErr error) (bool, error) {
				inner := &stubMutator{err: innerErr}
				h := &bestEffortMutatingHandler{
					bestEffortBase:    bestEffortBase{gate: gate, plugin: mutatingAdmissionWebhookPlugin},
					MutationInterface: inner,
				}
				err := h.Admit(context.Background(), testAttributes(), nil)
				return inner.called, err
			},
		},
	}

	cases := []struct {
		name       string
		synced     bool
		innerErr   error
		wantCalled bool
		wantErrIs  error
	}{
		{
			// The whole point: an unsynced plugin would stall 10s in WaitForReady and then 403.
			// required=false promises we keep serving instead.
			name:       "unsynced short-circuits to allow without reaching the plugin",
			synced:     false,
			innerErr:   denied,
			wantCalled: false,
		},
		{
			name:       "synced delegates and admits",
			synced:     true,
			wantCalled: true,
		},
		{
			// Being best-effort about readiness must not soften a plugin that did evaluate.
			name:       "synced delegates and surfaces a rejection",
			synced:     true,
			innerErr:   denied,
			wantCalled: true,
			wantErrIs:  denied,
		},
	}

	for _, phase := range phases {
		for _, tc := range cases {
			t.Run(phase.name+"/"+tc.name, func(t *testing.T) {
				t.Parallel()

				called, err := phase.invoke(gateWith(tc.synced), tc.innerErr)
				if called != tc.wantCalled {
					t.Errorf("plugin reached = %v, want %v", called, tc.wantCalled)
				}
				if tc.wantErrIs == nil && err != nil {
					t.Errorf("expected the request to be admitted, got %v", err)
				}
				if tc.wantErrIs != nil && !errors.Is(err, tc.wantErrIs) {
					t.Errorf("expected %v to surface, got %v", tc.wantErrIs, err)
				}
			})
		}
	}
}
