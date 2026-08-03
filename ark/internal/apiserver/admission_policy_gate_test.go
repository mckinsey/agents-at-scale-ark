/* Copyright 2025. McKinsey & Company */

package apiserver

import (
	"context"
	"errors"
	"testing"

	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apiserver/pkg/admission"
	genericoptions "k8s.io/apiserver/pkg/server/options"
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

func TestBestEffortValidatingHandler_Validate(t *testing.T) {
	t.Parallel()

	denied := errors.New("denied by policy")

	cases := []struct {
		name       string
		synced     bool
		innerErr   error
		wantCalled bool
		wantErrIs  error
	}{
		{
			// The whole point: an unsynced plugin would stall 10s in WaitForReady and then 403.
			// policy.required=false promises we keep serving instead.
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
			// Being best-effort about readiness must not soften a policy that did evaluate.
			name:       "synced delegates and surfaces a rejection",
			synced:     true,
			innerErr:   denied,
			wantCalled: true,
			wantErrIs:  denied,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			inner := &stubValidator{err: tc.innerErr}
			h := &bestEffortValidatingHandler{bestEffortBase: bestEffortBase{gate: gateWith(tc.synced), plugin: validatingAdmissionPolicyPlugin}, ValidationInterface: inner}

			err := h.Validate(context.Background(), testAttributes(), nil)
			if inner.called != tc.wantCalled {
				t.Errorf("plugin reached = %v, want %v", inner.called, tc.wantCalled)
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
