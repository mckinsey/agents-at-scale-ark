package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/spf13/pflag"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/runtime/serializer"
	utilruntime "k8s.io/apimachinery/pkg/util/runtime"
	genericrequest "k8s.io/apiserver/pkg/endpoints/request"
	"k8s.io/apiserver/pkg/registry/rest"
	genericapiserver "k8s.io/apiserver/pkg/server"
	genericoptions "k8s.io/apiserver/pkg/server/options"
	"k8s.io/apiserver/pkg/util/compatibility"
	"k8s.io/klog/v2"
	openapicommon "k8s.io/kube-openapi/pkg/common"
	"k8s.io/kube-openapi/pkg/spec3"
	"k8s.io/kube-openapi/pkg/validation/spec"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	apiserverv1alpha1 "mckinsey.com/ark-apiserver/pkg/apis/ark/v1alpha1"
	apiserverv1prealpha1 "mckinsey.com/ark-apiserver/pkg/apis/ark/v1prealpha1"
	_ "mckinsey.com/ark-apiserver/pkg/metrics"
	genericregistry "mckinsey.com/ark-apiserver/pkg/registry/generic"
	"mckinsey.com/ark-apiserver/pkg/storage"
	"mckinsey.com/ark-apiserver/pkg/storage/postgresql"
	"mckinsey.com/ark-apiserver/pkg/storage/sqlite"
)

var (
	Scheme         = runtime.NewScheme()
	Codecs         = serializer.NewCodecFactory(Scheme)
	ParameterCodec = runtime.NewParameterCodec(Scheme)
)

func init() {
	utilruntime.Must(arkv1alpha1.AddToScheme(Scheme))
	utilruntime.Must(arkv1prealpha1.AddToScheme(Scheme))
	utilruntime.Must(metav1.AddMetaToScheme(Scheme))
	metav1.AddToGroupVersion(Scheme, schema.GroupVersion{Group: "", Version: "v1"})
}

func GetCombinedOpenAPIDefinitions(ref openapicommon.ReferenceCallback) map[string]openapicommon.OpenAPIDefinition {
	defs := apiserverv1alpha1.GetOpenAPIDefinitions(ref)
	for k, v := range apiserverv1prealpha1.GetOpenAPIDefinitions(ref) {
		defs[k] = v
	}
	return defs
}

type ArkServerOptions struct {
	SecureServing *genericoptions.SecureServingOptionsWithLoopback

	StorageDriver    string
	SQLitePath       string
	PostgresHost     string
	PostgresPort     int
	PostgresDB       string
	PostgresUser     string
	PostgresPassword string
	PostgresSSLMode  string
	MetricsPort      int
	EnableMetrics    bool

	RunCleanup       bool
	CleanupRetention string
}

func NewArkServerOptions() *ArkServerOptions {
	secureServing := genericoptions.NewSecureServingOptions().WithLoopback()
	secureServing.HTTP2MaxStreamsPerConnection = 1000

	o := &ArkServerOptions{
		SecureServing: secureServing,
		StorageDriver: "sqlite",
		SQLitePath:    "/data/ark.db",
		MetricsPort:   8080,
		EnableMetrics: true,
	}
	return o
}

func (o *ArkServerOptions) AddFlags(fs *pflag.FlagSet) {
	o.SecureServing.AddFlags(fs)
	fs.StringVar(&o.StorageDriver, "storage-driver", o.StorageDriver, "Storage driver (sqlite, postgresql)")
	fs.StringVar(&o.SQLitePath, "sqlite-path", o.SQLitePath, "SQLite database path")
	fs.StringVar(&o.PostgresHost, "postgres-host", o.PostgresHost, "PostgreSQL host")
	fs.IntVar(&o.PostgresPort, "postgres-port", 5432, "PostgreSQL port")
	fs.StringVar(&o.PostgresDB, "postgres-db", "ark", "PostgreSQL database name")
	fs.StringVar(&o.PostgresUser, "postgres-user", "ark", "PostgreSQL user")
	fs.StringVar(&o.PostgresPassword, "postgres-password", "", "PostgreSQL password")
	fs.StringVar(&o.PostgresSSLMode, "postgres-sslmode", "disable", "PostgreSQL SSL mode (disable, require, verify-ca, verify-full)")
	fs.IntVar(&o.MetricsPort, "metrics-port", o.MetricsPort, "Port for metrics endpoint")
	fs.BoolVar(&o.EnableMetrics, "enable-metrics", o.EnableMetrics, "Enable Prometheus metrics endpoint")
	fs.BoolVar(&o.RunCleanup, "cleanup", false, "Run cleanup of soft-deleted resources and exit")
	fs.StringVar(&o.CleanupRetention, "cleanup-retention", "168h", "Retention period for soft-deleted resources (e.g., 24h, 168h)")
}

func (o *ArkServerOptions) Validate() []error {
	var errors []error
	if o.StorageDriver != "sqlite" && o.StorageDriver != "postgresql" {
		errors = append(errors, fmt.Errorf("invalid storage driver: %s", o.StorageDriver))
	}
	errors = append(errors, o.SecureServing.Validate()...)
	return errors
}

func (o *ArkServerOptions) RunArkServer(stopCh <-chan struct{}) error {
	if err := o.SecureServing.MaybeDefaultWithSelfSignedCerts("localhost", nil, nil); err != nil {
		return fmt.Errorf("error creating self-signed certificates: %v", err)
	}

	serverConfig := genericapiserver.NewConfig(Codecs)
	serverConfig.EffectiveVersion = compatibility.DefaultBuildEffectiveVersion()
	serverConfig.RequestTimeout = 24 * time.Hour
	serverConfig.MinRequestTimeout = 86400
	serverConfig.LongRunningFunc = func(r *http.Request, requestInfo *genericrequest.RequestInfo) bool {
		return true
	}

	serverConfig.OpenAPIV3Config = &openapicommon.OpenAPIV3Config{
		IgnorePrefixes: []string{"/swaggerapi"},
		Info: &spec.Info{
			InfoProps: spec.InfoProps{
				Title:   "Ark API Server",
				Version: "v1alpha1",
			},
		},
		DefaultResponse: &spec3.Response{
			ResponseProps: spec3.ResponseProps{
				Description: "Default Response.",
			},
		},
		GetDefinitions: GetCombinedOpenAPIDefinitions,
	}

	if err := o.SecureServing.ApplyTo(&serverConfig.SecureServing, &serverConfig.LoopbackClientConfig); err != nil {
		return err
	}

	converter := storage.NewArkTypeConverter()
	var backend storage.Backend
	var err error

	switch o.StorageDriver {
	case "sqlite":
		dir := filepath.Dir(o.SQLitePath)
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("failed to create data directory: %w", err)
		}
		backend, err = sqlite.New(o.SQLitePath, converter)
		if err != nil {
			return fmt.Errorf("failed to create SQLite backend: %w", err)
		}
	case "postgresql":
		cfg := postgresql.Config{
			Host:     o.PostgresHost,
			Port:     o.PostgresPort,
			Database: o.PostgresDB,
			User:     o.PostgresUser,
			Password: o.PostgresPassword,
			SSLMode:  o.PostgresSSLMode,
		}
		backend, err = postgresql.New(cfg, converter)
		if err != nil {
			return fmt.Errorf("failed to create PostgreSQL backend: %w", err)
		}
	default:
		return fmt.Errorf("unsupported storage driver: %s", o.StorageDriver)
	}

	defer backend.Close()

	completedConfig := serverConfig.Complete(nil)
	server, err := completedConfig.New("ark-apiserver", genericapiserver.NewEmptyDelegate())
	if err != nil {
		return err
	}

	apiGroupInfo := genericapiserver.NewDefaultAPIGroupInfo(arkv1alpha1.GroupVersion.Group, Scheme, ParameterCodec, Codecs)

	queryConfig := genericregistry.ResourceConfig{
		Kind:         "Query",
		Resource:     "queries",
		SingularName: "query",
		NewFunc:      func() runtime.Object { return &arkv1alpha1.Query{} },
		NewListFunc:  func() runtime.Object { return &arkv1alpha1.QueryList{} },
	}
	agentConfig := genericregistry.ResourceConfig{
		Kind:         "Agent",
		Resource:     "agents",
		SingularName: "agent",
		NewFunc:      func() runtime.Object { return &arkv1alpha1.Agent{} },
		NewListFunc:  func() runtime.Object { return &arkv1alpha1.AgentList{} },
	}
	modelConfig := genericregistry.ResourceConfig{
		Kind:         "Model",
		Resource:     "models",
		SingularName: "model",
		NewFunc:      func() runtime.Object { return &arkv1alpha1.Model{} },
		NewListFunc:  func() runtime.Object { return &arkv1alpha1.ModelList{} },
	}
	teamConfig := genericregistry.ResourceConfig{
		Kind:         "Team",
		Resource:     "teams",
		SingularName: "team",
		NewFunc:      func() runtime.Object { return &arkv1alpha1.Team{} },
		NewListFunc:  func() runtime.Object { return &arkv1alpha1.TeamList{} },
	}
	toolConfig := genericregistry.ResourceConfig{
		Kind:         "Tool",
		Resource:     "tools",
		SingularName: "tool",
		NewFunc:      func() runtime.Object { return &arkv1alpha1.Tool{} },
		NewListFunc:  func() runtime.Object { return &arkv1alpha1.ToolList{} },
	}
	memoryConfig := genericregistry.ResourceConfig{
		Kind:         "Memory",
		Resource:     "memories",
		SingularName: "memory",
		NewFunc:      func() runtime.Object { return &arkv1alpha1.Memory{} },
		NewListFunc:  func() runtime.Object { return &arkv1alpha1.MemoryList{} },
	}
	mcpserverConfig := genericregistry.ResourceConfig{
		Kind:         "MCPServer",
		Resource:     "mcpservers",
		SingularName: "mcpserver",
		NewFunc:      func() runtime.Object { return &arkv1alpha1.MCPServer{} },
		NewListFunc:  func() runtime.Object { return &arkv1alpha1.MCPServerList{} },
	}
	evaluationConfig := genericregistry.ResourceConfig{
		Kind:         "Evaluation",
		Resource:     "evaluations",
		SingularName: "evaluation",
		NewFunc:      func() runtime.Object { return &arkv1alpha1.Evaluation{} },
		NewListFunc:  func() runtime.Object { return &arkv1alpha1.EvaluationList{} },
	}
	evaluatorConfig := genericregistry.ResourceConfig{
		Kind:         "Evaluator",
		Resource:     "evaluators",
		SingularName: "evaluator",
		NewFunc:      func() runtime.Object { return &arkv1alpha1.Evaluator{} },
		NewListFunc:  func() runtime.Object { return &arkv1alpha1.EvaluatorList{} },
	}
	a2ataskConfig := genericregistry.ResourceConfig{
		Kind:         "A2ATask",
		Resource:     "a2atasks",
		SingularName: "a2atask",
		NewFunc:      func() runtime.Object { return &arkv1alpha1.A2ATask{} },
		NewListFunc:  func() runtime.Object { return &arkv1alpha1.A2ATaskList{} },
	}

	apiGroupInfo.VersionedResourcesStorageMap[arkv1alpha1.GroupVersion.Version] = map[string]rest.Storage{
		"queries":            genericregistry.NewGenericStorage(backend, converter, queryConfig),
		"queries/status":     genericregistry.NewStatusStorage(backend, converter, queryConfig),
		"agents":             genericregistry.NewGenericStorage(backend, converter, agentConfig),
		"agents/status":      genericregistry.NewStatusStorage(backend, converter, agentConfig),
		"models":             genericregistry.NewGenericStorage(backend, converter, modelConfig),
		"models/status":      genericregistry.NewStatusStorage(backend, converter, modelConfig),
		"teams":              genericregistry.NewGenericStorage(backend, converter, teamConfig),
		"teams/status":       genericregistry.NewStatusStorage(backend, converter, teamConfig),
		"tools":              genericregistry.NewGenericStorage(backend, converter, toolConfig),
		"tools/status":       genericregistry.NewStatusStorage(backend, converter, toolConfig),
		"memories":           genericregistry.NewGenericStorage(backend, converter, memoryConfig),
		"memories/status":    genericregistry.NewStatusStorage(backend, converter, memoryConfig),
		"mcpservers":         genericregistry.NewGenericStorage(backend, converter, mcpserverConfig),
		"mcpservers/status":  genericregistry.NewStatusStorage(backend, converter, mcpserverConfig),
		"evaluations":        genericregistry.NewGenericStorage(backend, converter, evaluationConfig),
		"evaluations/status": genericregistry.NewStatusStorage(backend, converter, evaluationConfig),
		"evaluators":         genericregistry.NewGenericStorage(backend, converter, evaluatorConfig),
		"evaluators/status":  genericregistry.NewStatusStorage(backend, converter, evaluatorConfig),
		"a2atasks":           genericregistry.NewGenericStorage(backend, converter, a2ataskConfig),
		"a2atasks/status":    genericregistry.NewStatusStorage(backend, converter, a2ataskConfig),
	}

	a2aserverConfig := genericregistry.ResourceConfig{
		Kind:         "A2AServer",
		Resource:     "a2aservers",
		SingularName: "a2aserver",
		NewFunc:      func() runtime.Object { return &arkv1prealpha1.A2AServer{} },
		NewListFunc:  func() runtime.Object { return &arkv1prealpha1.A2AServerList{} },
	}
	executionengineConfig := genericregistry.ResourceConfig{
		Kind:         "ExecutionEngine",
		Resource:     "executionengines",
		SingularName: "executionengine",
		NewFunc:      func() runtime.Object { return &arkv1prealpha1.ExecutionEngine{} },
		NewListFunc:  func() runtime.Object { return &arkv1prealpha1.ExecutionEngineList{} },
	}

	apiGroupInfo.VersionedResourcesStorageMap[arkv1prealpha1.GroupVersion.Version] = map[string]rest.Storage{
		"a2aservers":              genericregistry.NewGenericStorage(backend, converter, a2aserverConfig),
		"a2aservers/status":       genericregistry.NewStatusStorage(backend, converter, a2aserverConfig),
		"executionengines":        genericregistry.NewGenericStorage(backend, converter, executionengineConfig),
		"executionengines/status": genericregistry.NewStatusStorage(backend, converter, executionengineConfig),
	}

	if err := server.InstallAPIGroup(&apiGroupInfo); err != nil {
		return fmt.Errorf("failed to install API group: %w", err)
	}

	if o.EnableMetrics {
		go func() {
			mux := http.NewServeMux()
			mux.Handle("/metrics", promhttp.Handler())
			metricsAddr := fmt.Sprintf(":%d", o.MetricsPort)
			klog.Infof("Starting metrics server on %s", metricsAddr)
			if err := http.ListenAndServe(metricsAddr, mux); err != nil {
				klog.Errorf("Metrics server failed: %v", err)
			}
		}()
	}

	klog.Info("Starting Ark API Server")
	return server.PrepareRun().Run(stopCh)
}

func (o *ArkServerOptions) ExecuteCleanup() error {
	retention, err := time.ParseDuration(o.CleanupRetention)
	if err != nil {
		return fmt.Errorf("invalid cleanup-retention: %w", err)
	}

	converter := storage.NewArkTypeConverter()
	var backend storage.Backend

	switch o.StorageDriver {
	case "sqlite":
		dir := filepath.Dir(o.SQLitePath)
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("failed to create data directory: %w", err)
		}
		backend, err = sqlite.New(o.SQLitePath, converter)
		if err != nil {
			return fmt.Errorf("failed to create SQLite backend: %w", err)
		}
	case "postgresql":
		cfg := postgresql.Config{
			Host:     o.PostgresHost,
			Port:     o.PostgresPort,
			Database: o.PostgresDB,
			User:     o.PostgresUser,
			Password: o.PostgresPassword,
			SSLMode:  o.PostgresSSLMode,
		}
		backend, err = postgresql.New(cfg, converter)
		if err != nil {
			return fmt.Errorf("failed to create PostgreSQL backend: %w", err)
		}
	default:
		return fmt.Errorf("unsupported storage driver: %s", o.StorageDriver)
	}
	defer backend.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	klog.Infof("Running cleanup with retention %s", retention)
	deleted, err := backend.Cleanup(ctx, retention)
	if err != nil {
		return fmt.Errorf("cleanup failed: %w", err)
	}

	klog.Infof("Cleanup complete: %d resources permanently deleted", deleted)
	return nil
}

func main() {
	klog.InitFlags(nil)
	defer klog.Flush()

	options := NewArkServerOptions()
	fs := pflag.CommandLine
	options.AddFlags(fs)
	pflag.Parse()

	if errs := options.Validate(); len(errs) > 0 {
		for _, err := range errs {
			klog.Error(err)
		}
		os.Exit(1)
	}

	if options.RunCleanup {
		if err := options.ExecuteCleanup(); err != nil {
			klog.Fatal(err)
		}
		return
	}

	stopCh := genericapiserver.SetupSignalHandler()
	if err := options.RunArkServer(stopCh); err != nil {
		klog.Fatal(err)
	}
}
