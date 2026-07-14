package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	_ "k8s.io/client-go/plugin/pkg/client/auth" // Required for cloud provider auth plugins

	"k8s.io/apimachinery/pkg/runtime"
	utilruntime "k8s.io/apimachinery/pkg/util/runtime"
	clientgoscheme "k8s.io/client-go/kubernetes/scheme"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/log/zap"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	completions "mckinsey.com/ark/executors/completions"
	eventingconfig "mckinsey.com/ark/internal/eventing/config"
	telemetryconfig "mckinsey.com/ark/internal/telemetry/config"
)

var (
	scheme = runtime.NewScheme()

	Version   = "dev"
	GitCommit = "unknown"
)

func init() {
	utilruntime.Must(clientgoscheme.AddToScheme(scheme))
	utilruntime.Must(arkv1alpha1.AddToScheme(scheme))
	utilruntime.Must(arkv1prealpha1.AddToScheme(scheme))
}

// serverConfigFromEnv assembles the completions ServerConfig from environment variables.
// Extracted from main so the Redis wiring and task-expiry parsing are unit-testable.
func serverConfigFromEnv(addr string) completions.ServerConfig {
	var taskExpiry time.Duration
	if raw := os.Getenv("REDIS_TASK_EXPIRY_SECONDS"); raw != "" {
		if secs, parseErr := strconv.Atoi(raw); parseErr == nil && secs > 0 {
			taskExpiry = time.Duration(secs) * time.Second
		}
	}
	return completions.ServerConfig{
		Addr:            addr,
		RedisURL:        os.Getenv("REDIS_URL"),
		RedisPassword:   os.Getenv("REDIS_PASSWORD"),
		RedisCACertPath: os.Getenv("REDIS_TLS_CA_CERT_PATH"),
		TaskExpiry:      taskExpiry,
	}
}

func main() {
	var addr string
	var showVersion bool
	var shutdownTimeout time.Duration
	flag.StringVar(&addr, "addr", ":9090", "Address to listen on")
	flag.BoolVar(&showVersion, "version", false, "Show version information and exit")
	flag.DurationVar(&shutdownTimeout, "shutdown-timeout", 55*time.Second,
		"Max time to drain in-flight requests on shutdown; keep below the pod's terminationGracePeriodSeconds")
	zapOpts := zap.Options{Development: false}
	zapOpts.BindFlags(flag.CommandLine)
	flag.Parse()

	ctrl.SetLogger(zap.New(zap.UseFlagOptions(&zapOpts)))
	log := ctrl.Log.WithName("completions")

	if showVersion {
		fmt.Printf("Version: %s\nCommit: %s\n", Version, GitCommit)
		os.Exit(0)
	}

	log.Info("starting ark completions engine", "version", Version, "commit", GitCommit)

	restConfig := ctrl.GetConfigOrDie()
	k8sClient, err := client.New(restConfig, client.Options{Scheme: scheme})
	if err != nil {
		log.Error(err, "failed to create kubernetes client")
		os.Exit(1)
	}

	ctx := context.Background()
	telemetryProvider := telemetryconfig.NewProvider(ctx, k8sClient)
	eventingProvider := eventingconfig.NewProviderWithClient(ctx, k8sClient)

	srv, err := completions.NewServer(k8sClient, telemetryProvider, eventingProvider, serverConfigFromEnv(addr))
	if err != nil {
		log.Error(err, "failed to create completions engine server")
		if shutdownErr := telemetryProvider.Shutdown(); shutdownErr != nil {
			log.Error(shutdownErr, "failed to shutdown telemetry provider")
		}
		os.Exit(1)
	}
	defer func() {
		if err := telemetryProvider.Shutdown(); err != nil {
			log.Error(err, "failed to shutdown telemetry provider")
		}
	}()

	ctx, cancel := signal.NotifyContext(ctx, syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	errCh := make(chan error, 1)
	go func() {
		log.Info("listening", "addr", addr)
		errCh <- srv.Start()
	}()

	select {
	case err := <-errCh:
		if err != nil {
			log.Error(err, "server error")
			cancel()
		}
	case <-ctx.Done():
		log.Info("shutting down", "timeout", shutdownTimeout)
		// Fail readiness immediately so the pod leaves Service endpoints before draining.
		srv.SetNotReady()
		shutdownCtx, cancelShutdown := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancelShutdown()
		if err := srv.Stop(shutdownCtx); err != nil {
			log.Error(err, "shutdown error")
		}
	}
}
