/* Copyright 2025. McKinsey & Company */

package v1

import (
	"testing"

	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/rest"
	ctrl "sigs.k8s.io/controller-runtime"
	metricsserver "sigs.k8s.io/controller-runtime/pkg/metrics/server"
	"sigs.k8s.io/controller-runtime/pkg/webhook"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

// The generic NewWebhookManagedBy builder needs a concrete type argument; a
// runtime.Object argument makes its reflection panic at registration. Wire each
// webhook against a real manager so a reintroduction fails here, not only in e2e.
func TestSetupWebhooksWithManager(t *testing.T) {
	s := runtime.NewScheme()
	if err := arkv1alpha1.AddToScheme(s); err != nil {
		t.Fatalf("add to scheme: %v", err)
	}
	mgr, err := ctrl.NewManager(&rest.Config{Host: "https://127.0.0.1:1"}, ctrl.Options{
		Scheme:        s,
		Metrics:       metricsserver.Options{BindAddress: "0"},
		WebhookServer: webhook.NewServer(webhook.Options{Port: 0}),
	})
	if err != nil {
		t.Fatalf("new manager: %v", err)
	}

	setups := map[string]func(ctrl.Manager) error{
		"agent":     SetupAgentWebhookWithManager,
		"arkconfig": SetupArkConfigWebhookWithManager,
		"mcpserver": SetupMCPServerWebhookWithManager,
		"model":     SetupModelWebhookWithManager,
		"query":     SetupQueryWebhookWithManager,
		"team":      SetupTeamWebhookWithManager,
		"tool":      SetupToolWebhookWithManager,
	}
	for name, fn := range setups {
		if err := fn(mgr); err != nil {
			t.Fatalf("setup %s webhook: %v", name, err)
		}
	}
}
