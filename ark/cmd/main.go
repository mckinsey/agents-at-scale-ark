/* Copyright 2025. McKinsey & Company */

package main

import (
	"context"
	"crypto/tls"
	"flag"
	"fmt"
	"os"
	"path/filepath"

	// Import all Kubernetes client auth plugins (e.g. Azure, GCP, OIDC, etc.)
	// to ensure that exec-entrypoint and run can make use of them.
	_ "k8s.io/client-go/plugin/pkg/client/auth"
	"k8s.io/client-go/tools/record"

	"k8s.io/apimachinery/pkg/runtime"
	utilruntime "k8s.io/apimachinery/pkg/util/runtime"
	clientgoscheme "k8s.io/client-go/kubernetes/scheme"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/certwatcher"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/healthz"
	"sigs.k8s.io/controller-runtime/pkg/log/zap"
	"sigs.k8s.io/controller-runtime/pkg/metrics/filters"
	metricsserver "sigs.k8s.io/controller-runtime/pkg/metrics/server"
	"sigs.k8s.io/controller-runtime/pkg/webhook"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	"mckinsey.com/ark/internal/controller"
	eventingconfig "mckinsey.com/ark/internal/eventing/config"
	telemetryconfig "mckinsey.com/ark/internal/telemetry/config"
	webhookv1 "mckinsey.com/ark/internal/webhook/v1"
	webhookv1prealpha1 "mckinsey.com/ark/internal/webhook/v1prealpha1"
	// +kubebuilder:scaffold:imports
)

var (
	scheme   = runtime.NewScheme()
	setupLog = ctrl.Log.WithName("setup")

	// Version information injected at build time
	// Source of truth is version.txt managed by release-please
	Version   = "dev"
	GitCommit = "unknown"
)

func init() {
	utilruntime.Must(clientgoscheme.AddToScheme(scheme))

	utilruntime.Must(arkv1alpha1.AddToScheme(scheme))
	utilruntime.Must(arkv1prealpha1.AddToScheme(scheme))
	// +kubebuilder:scaffold:scheme
}

type config struct {
	metricsAddr                                      string
	metricsCertPath, metricsCertName, metricsCertKey string
	webhookCertPath, webhookCertName, webhookCertKey string
	enableLeaderElection                             bool
	probeAddr                                        string
	secureMetrics                                    bool
	enableHTTP2                                      bool
}

func main() {
	result := parseFlags()
	ctrl.SetLogger(zap.New(zap.UseFlagOptions(&result.zapOpts)))

	if result.showVersion {
		fmt.Printf("Version: %s\nCommit: %s\n", Version, GitCommit)
		os.Exit(0)
	}

	setupLog.Info("starting ark controller", "version", Version, "commit", GitCommit)

	mgr, metricsCertWatcher, webhookCertWatcher := setupManager(result.config)

	// Initialize telemetry provider with direct (non-cached) client for broker discovery
	ctx := context.Background()
	restConfig := ctrl.GetConfigOrDie()
	directClient, err := client.New(restConfig, client.Options{Scheme: scheme})
	if err != nil {
		setupLog.Error(err, "failed to create direct client for broker discovery")
		directClient = nil
	}
	telemetryProvider := telemetryconfig.NewProvider(ctx, directClient)
	defer func() {
		if err := telemetryProvider.Shutdown(); err != nil {
			setupLog.Error(err, "failed to shutdown telemetry provider")
		}
	}()

	// Initialize eventing provider with direct client for broker discovery
	eventingProvider := eventingconfig.NewProvider(mgr, directClient)

	setupControllers(mgr, telemetryProvider, eventingProvider)
	setupWebhooks(mgr)
	startManager(mgr, metricsCertWatcher, webhookCertWatcher)
}

func parseFlags() struct {
	config
	zapOpts     zap.Options
	showVersion bool
} {
	var cfg config
	var showVersion bool
	flag.StringVar(&cfg.metricsAddr, "metrics-bind-address", "0", "The address the metrics endpoint binds to. "+
		"Use :8443 for HTTPS or :8080 for HTTP, or leave as 0 to disable the metrics service.")
	flag.StringVar(&cfg.probeAddr, "health-probe-bind-address", ":8081", "The address the probe endpoint binds to.")
	flag.BoolVar(&cfg.enableLeaderElection, "leader-elect", false,
		"Enable leader election for controller manager. "+
			"Enabling this will ensure there is only one active controller manager.")
	flag.BoolVar(&cfg.secureMetrics, "metrics-secure", true,
		"If set, the metrics endpoint is served securely via HTTPS. Use --metrics-secure=false to use HTTP instead.")
	flag.StringVar(&cfg.webhookCertPath, "webhook-cert-path", "", "The directory that contains the webhook certificate.")
	flag.StringVar(&cfg.webhookCertName, "webhook-cert-name", "tls.crt", "The name of the webhook certificate file.")
	flag.StringVar(&cfg.webhookCertKey, "webhook-cert-key", "tls.key", "The name of the webhook key file.")
	flag.StringVar(&cfg.metricsCertPath, "metrics-cert-path", "",
		"The directory that contains the metrics server certificate.")
	flag.StringVar(&cfg.metricsCertName, "metrics-cert-name", "tls.crt", "The name of the metrics server certificate file.")
	flag.StringVar(&cfg.metricsCertKey, "metrics-cert-key", "tls.key", "The name of the metrics server key file.")
	flag.BoolVar(&cfg.enableHTTP2, "enable-http2", false,
		"If set, HTTP/2 will be enabled for the metrics and webhook servers")
	flag.BoolVar(&showVersion, "version", false, "Show version information and exit")

	zapOpts := zap.Options{Development: false}
	zapOpts.BindFlags(flag.CommandLine)
	flag.Parse()

	return struct {
		config
		zapOpts     zap.Options
		showVersion bool
	}{cfg, zapOpts, showVersion}
}

func setupManager(cfg config) (ctrl.Manager, *certwatcher.CertWatcher, *certwatcher.CertWatcher) {
	tlsOpts := setupTLS(cfg.enableHTTP2)
	webhookServer, webhookCertWatcher := setupWebhookServer(cfg, tlsOpts)
	metricsServerOptions, metricsCertWatcher := setupMetricsServer(cfg, tlsOpts)

	managerOptions := ctrl.Options{
		Scheme:                 scheme,
		Metrics:                metricsServerOptions,
		WebhookServer:          webhookServer,
		HealthProbeBindAddress: cfg.probeAddr,
		LeaderElection:         cfg.enableLeaderElection,
		LeaderElectionID:       "b5df0b4e.mckinsey",
		EventBroadcaster: record.NewBroadcasterWithCorrelatorOptions(record.CorrelatorOptions{
			BurstSize: 100,
			QPS:       100,
		}),
	}

	mgr, err := ctrl.NewManager(ctrl.GetConfigOrDie(), managerOptions)
	if err != nil {
		setupLog.Error(err, "unable to start manager")
		os.Exit(1)
	}

	return mgr, metricsCertWatcher, webhookCertWatcher
}

func setupTLS(enableHTTP2 bool) []func(*tls.Config) {
	var tlsOpts []func(*tls.Config)

	if !enableHTTP2 {
		disableHTTP2 := func(c *tls.Config) {
			setupLog.Info("disabling http/2")
			c.NextProtos = []string{"http/1.1"}
		}
		tlsOpts = append(tlsOpts, disableHTTP2)
	}

	return tlsOpts
}

func setupWebhookServer(cfg config, baseTLSOpts []func(*tls.Config)) (webhook.Server, *certwatcher.CertWatcher) {
	webhookTLSOpts := baseTLSOpts
	var webhookCertWatcher *certwatcher.CertWatcher

	if len(cfg.webhookCertPath) > 0 {
		setupLog.Info("Initializing webhook certificate watcher using provided certificates",
			"webhook-cert-path", cfg.webhookCertPath, "webhook-cert-name", cfg.webhookCertName, "webhook-cert-key", cfg.webhookCertKey)

		var err error
		webhookCertWatcher, err = certwatcher.New(
			filepath.Join(cfg.webhookCertPath, cfg.webhookCertName),
			filepath.Join(cfg.webhookCertPath, cfg.webhookCertKey),
		)
		if err != nil {
			setupLog.Error(err, "Failed to initialize webhook certificate watcher")
			os.Exit(1)
		}

		webhookTLSOpts = append(webhookTLSOpts, func(config *tls.Config) {
			config.GetCertificate = webhookCertWatcher.GetCertificate
		})
	}

	return webhook.NewServer(webhook.Options{TLSOpts: webhookTLSOpts}), webhookCertWatcher
}

func setupMetricsServer(cfg config, baseTLSOpts []func(*tls.Config)) (metricsserver.Options, *certwatcher.CertWatcher) {
	metricsServerOptions := metricsserver.Options{
		BindAddress:   cfg.metricsAddr,
		SecureServing: cfg.secureMetrics,
		TLSOpts:       baseTLSOpts,
	}

	if cfg.secureMetrics {
		metricsServerOptions.FilterProvider = filters.WithAuthenticationAndAuthorization
	}

	var metricsCertWatcher *certwatcher.CertWatcher
	if len(cfg.metricsCertPath) > 0 {
		setupLog.Info("Initializing metrics certificate watcher using provided certificates",
			"metrics-cert-path", cfg.metricsCertPath, "metrics-cert-name", cfg.metricsCertName, "metrics-cert-key", cfg.metricsCertKey)

		var err error
		metricsCertWatcher, err = certwatcher.New(
			filepath.Join(cfg.metricsCertPath, cfg.metricsCertName),
			filepath.Join(cfg.metricsCertPath, cfg.metricsCertKey),
		)
		if err != nil {
			setupLog.Error(err, "to initialize metrics certificate watcher", "error", err)
			os.Exit(1)
		}

		metricsServerOptions.TLSOpts = append(metricsServerOptions.TLSOpts, func(config *tls.Config) {
			config.GetCertificate = metricsCertWatcher.GetCertificate
		})
	}

	return metricsServerOptions, metricsCertWatcher
}

func setupControllers(mgr ctrl.Manager, telemetryProvider *telemetryconfig.Provider, eventingProvider *eventingconfig.Provider) {
	controllers := []struct {
		name       string
		reconciler interface{ SetupWithManager(ctrl.Manager) error }
	}{
		{"Agent", &controller.AgentReconciler{
			Client:   mgr.GetClient(),
			Scheme:   mgr.GetScheme(),
			Eventing: eventingProvider,
		}},
		{"Query", &controller.QueryReconciler{
			Client:    mgr.GetClient(),
			Scheme:    mgr.GetScheme(),
			Telemetry: telemetryProvider,
			Eventing:  eventingProvider,
		}},
		{"Tool", &controller.ToolReconciler{Client: mgr.GetClient(), Scheme: mgr.GetScheme()}},
		{"Team", &controller.TeamReconciler{Client: mgr.GetClient(), Scheme: mgr.GetScheme(), Recorder: mgr.GetEventRecorderFor("team-controller")}},
		{"A2AServer", &controller.A2AServerReconciler{
			Client:   mgr.GetClient(),
			Scheme:   mgr.GetScheme(),
			Eventing: eventingProvider,
		}},
		{"MCPServer", &controller.MCPServerReconciler{
			Client:   mgr.GetClient(),
			Scheme:   mgr.GetScheme(),
			Eventing: eventingProvider,
		}},
		{"Model", &controller.ModelReconciler{
			Client:    mgr.GetClient(),
			Scheme:    mgr.GetScheme(),
			Telemetry: telemetryProvider,
			Eventing:  eventingProvider,
		}},
		{"Memory", &controller.MemoryReconciler{Client: mgr.GetClient(), Scheme: mgr.GetScheme()}},
		{"ExecutionEngine", &controller.ExecutionEngineReconciler{
			Client:   mgr.GetClient(),
			Scheme:   mgr.GetScheme(),
			Eventing: eventingProvider,
		}},
		{"Evaluator", &controller.EvaluatorReconciler{Client: mgr.GetClient(), Scheme: mgr.GetScheme()}},
		{"Evaluation", &controller.EvaluationReconciler{Client: mgr.GetClient(), Scheme: mgr.GetScheme()}},
		{"A2ATask", &controller.A2ATaskReconciler{
			Client:   mgr.GetClient(),
			Scheme:   mgr.GetScheme(),
			Eventing: eventingProvider,
		}},
	}

	for _, reconciler := range controllers {
		if err := reconciler.reconciler.SetupWithManager(mgr); err != nil {
			setupLog.Error(err, "unable to create controller", "controller", reconciler.name)
			os.Exit(1)
		}
	}
}

func setupWebhooks(mgr ctrl.Manager) {
	if os.Getenv("ENABLE_WEBHOOKS") == "false" {
		return
	}

	webhooks := []struct {
		name  string
		setup func(ctrl.Manager) error
	}{
		{"Team", webhookv1.SetupTeamWebhookWithManager},
		{"Agent", webhookv1.SetupAgentWebhookWithManager},
		{"Query", webhookv1.SetupQueryWebhookWithManager},
		{"Tool", webhookv1.SetupToolWebhookWithManager},
		{"Model", webhookv1.SetupModelWebhookWithManager},
		{"MCPServer", webhookv1.SetupMCPServerWebhookWithManager},
		{"Evaluator", webhookv1.SetupEvaluatorWebhookWithManager},
		{"Evaluation", webhookv1.SetupEvaluationWebhookWithManager},
		{"A2AServer", webhookv1prealpha1.SetupA2AServerWebhookWithManager},
		{"ExecutionEngine", webhookv1prealpha1.SetupExecutionEngineWebhookWithManager},
	}

	for _, hook := range webhooks {
		if err := hook.setup(mgr); err != nil {
			setupLog.Error(err, "unable to create webhook", "webhook", hook.name)
			os.Exit(1)
		}
	}
}

func startManager(mgr ctrl.Manager, metricsCertWatcher, webhookCertWatcher *certwatcher.CertWatcher) {
	if metricsCertWatcher != nil {
		setupLog.Info("Adding metrics certificate watcher to manager")
		if err := mgr.Add(metricsCertWatcher); err != nil {
			setupLog.Error(err, "unable to add metrics certificate watcher to manager")
			os.Exit(1)
		}
	}

	if webhookCertWatcher != nil {
		setupLog.Info("Adding webhook certificate watcher to manager")
		if err := mgr.Add(webhookCertWatcher); err != nil {
			setupLog.Error(err, "unable to add webhook certificate watcher to manager")
			os.Exit(1)
		}
	}

	if err := mgr.AddHealthzCheck("healthz", healthz.Ping); err != nil {
		setupLog.Error(err, "unable to set up health check")
		os.Exit(1)
	}
	if err := mgr.AddReadyzCheck("readyz", healthz.Ping); err != nil {
		setupLog.Error(err, "unable to set up ready check")
		os.Exit(1)
	}

	setupLog.Info("starting manager")
	if err := mgr.Start(ctrl.SetupSignalHandler()); err != nil {
		setupLog.Error(err, "problem running manager")
		os.Exit(1)
	}
}
