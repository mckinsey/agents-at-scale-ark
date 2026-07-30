/* Copyright 2025. McKinsey & Company */

package apiserver

import (
	"context"
	"fmt"
	"net/http"
	"time"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/runtime/serializer"
	utilruntime "k8s.io/apimachinery/pkg/util/runtime"
	"k8s.io/apiserver/pkg/authorization/authorizerfactory"
	apiopenapi "k8s.io/apiserver/pkg/endpoints/openapi"
	genericrequest "k8s.io/apiserver/pkg/endpoints/request"
	"k8s.io/apiserver/pkg/registry/rest"
	genericapiserver "k8s.io/apiserver/pkg/server"
	genericoptions "k8s.io/apiserver/pkg/server/options"
	"k8s.io/apiserver/pkg/util/compatibility"
	utilfeature "k8s.io/apiserver/pkg/util/feature"
	"k8s.io/client-go/discovery"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/informers"
	"k8s.io/client-go/kubernetes"
	clientrest "k8s.io/client-go/rest"
	"k8s.io/klog/v2"
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	"mckinsey.com/ark/internal/apiserver/registry"
	"mckinsey.com/ark/internal/storage"
	"mckinsey.com/ark/internal/storage/postgresql"
	"mckinsey.com/ark/internal/validation"
	"sigs.k8s.io/controller-runtime/pkg/client"
)

var (
	Scheme         = runtime.NewScheme()
	Codecs         = serializer.NewCodecFactory(Scheme)
	ParameterCodec = runtime.NewParameterCodec(Scheme)
)

type jsonOnlyNegotiatedSerializer struct {
	serializer.CodecFactory
}

func (s jsonOnlyNegotiatedSerializer) SupportedMediaTypes() []runtime.SerializerInfo {
	all := s.CodecFactory.SupportedMediaTypes()
	result := make([]runtime.SerializerInfo, 0, len(all))
	for _, info := range all {
		if info.MediaType != runtime.ContentTypeProtobuf {
			result = append(result, info)
		}
	}
	return result
}

func init() {
	utilruntime.Must(arkv1alpha1.AddToScheme(Scheme))
	utilruntime.Must(arkv1prealpha1.AddToScheme(Scheme))
	utilruntime.Must(metav1.AddMetaToScheme(Scheme))
	metav1.AddToGroupVersion(Scheme, schema.GroupVersion{Group: "", Version: "v1"})

	// Register external types as internal versions to enable patch operations.
	// Since ARK only has one version per API group, we use the external types
	// as the internal representation (no conversion needed).
	// Without this, kubectl patch fails with "no kind X is registered for internal version".
	internalGV := schema.GroupVersion{Group: arkv1alpha1.GroupVersion.Group, Version: runtime.APIVersionInternal}
	Scheme.AddKnownTypes(
		internalGV,
		&arkv1alpha1.Agent{},
		&arkv1alpha1.AgentList{},
		&arkv1alpha1.Team{},
		&arkv1alpha1.TeamList{},
		&arkv1alpha1.Query{},
		&arkv1alpha1.QueryList{},
		&arkv1alpha1.Model{},
		&arkv1alpha1.ModelList{},
		&arkv1alpha1.Tool{},
		&arkv1alpha1.ToolList{},
		&arkv1alpha1.MCPServer{},
		&arkv1alpha1.MCPServerList{},
		&arkv1alpha1.Memory{},
		&arkv1alpha1.MemoryList{},
		&arkv1alpha1.A2ATask{},
		&arkv1alpha1.A2ATaskList{},
		&arkv1alpha1.ArkConfig{},
		&arkv1alpha1.ArkConfigList{},
	)
	Scheme.AddKnownTypes(
		internalGV,
		&arkv1prealpha1.A2AServer{},
		&arkv1prealpha1.A2AServerList{},
		&arkv1prealpha1.ExecutionEngine{},
		&arkv1prealpha1.ExecutionEngineList{},
	)
}

const (
	AuthModeDelegated = "delegated"
	AuthModeOff       = "off"
)

type Config struct {
	PostgresHost    string
	PostgresPort    int
	PostgresDB      string
	PostgresUser    string
	PostgresPass    string
	PostgresSSL     string
	PostgresSSLRoot string
	PostgresSSLCert string
	PostgresSSLKey  string
	BindPort        int
	AuthMode        string
	TLSCertFile     string
	TLSKeyFile      string
	K8sClient       client.Client
	// RestConfig points at the host kube-apiserver, where the policy objects live.
	RestConfig *clientrest.Config
	// AuditLogPath "-" writes JSON to stdout. AuditPolicyFile is mandatory when AuditEnabled.
	AuditEnabled    bool
	AuditPolicyFile string
	AuditLogPath    string
	// PolicyRequired makes CEL enforcement a startup precondition rather than best-effort.
	PolicyRequired bool
}

type Server struct {
	config       Config
	backend      *postgresql.PostgreSQLBackend
	backendReady chan struct{}
	stopCh       chan struct{}
}

func New(cfg Config) *Server {
	if cfg.BindPort == 0 {
		cfg.BindPort = 6443
	}
	if cfg.AuthMode == "" {
		cfg.AuthMode = AuthModeDelegated
	}
	return &Server{
		config:       cfg,
		backendReady: make(chan struct{}),
		stopCh:       make(chan struct{}),
	}
}

// walConsumer starts the backend's WAL consumer once this replica holds the
// leader lease. The replication slot is single-consumer: without this gate,
// extra replicas error-loop trying to acquire the slot.
type walConsumer struct {
	ready <-chan struct{}
	start func()
}

func (w *walConsumer) Start(ctx context.Context) error {
	select {
	case <-ctx.Done():
		return nil
	case <-w.ready:
	}
	klog.Info("Leader lease acquired; starting WAL consumer")
	w.start()
	<-ctx.Done()
	return nil
}

func (w *walConsumer) NeedLeaderElection() bool {
	return true
}

func (s *Server) WALConsumer() *walConsumer {
	return &walConsumer{
		ready: s.backendReady,
		start: func() { s.backend.StartWALConsumer() },
	}
}

func (s *Server) Start(ctx context.Context) error {
	if s.config.AuthMode != AuthModeDelegated && s.config.AuthMode != AuthModeOff {
		return fmt.Errorf("invalid auth mode %q: must be %q or %q", s.config.AuthMode, AuthModeDelegated, AuthModeOff)
	}

	klog.Info("Starting embedded Ark API Server")

	converter := NewRegistryTypeConverter()
	var err error

	cfg := postgresql.Config{
		Host:        s.config.PostgresHost,
		Port:        s.config.PostgresPort,
		Database:    s.config.PostgresDB,
		User:        s.config.PostgresUser,
		Password:    s.config.PostgresPass,
		SSLMode:     s.config.PostgresSSL,
		SSLRootCert: s.config.PostgresSSLRoot,
		SSLCert:     s.config.PostgresSSLCert,
		SSLKey:      s.config.PostgresSSLKey,
	}
	s.backend, err = postgresql.New(cfg, converter)
	if err != nil {
		return fmt.Errorf("failed to create PostgreSQL backend: %w", err)
	}
	close(s.backendReady)
	klog.Infof("Using PostgreSQL storage backend: %s:%d/%s", cfg.Host, cfg.Port, cfg.Database)

	secureServing := genericoptions.NewSecureServingOptions().WithLoopback()
	secureServing.BindPort = s.config.BindPort
	secureServing.HTTP2MaxStreamsPerConnection = 1000
	secureServing.ServerCert.CertDirectory = "/tmp/ark-apiserver-certs"
	secureServing.ServerCert.CertKey.CertFile = s.config.TLSCertFile
	secureServing.ServerCert.CertKey.KeyFile = s.config.TLSKeyFile

	if err := secureServing.MaybeDefaultWithSelfSignedCerts("localhost", nil, nil); err != nil {
		return fmt.Errorf("error creating self-signed certificates: %v", err)
	}

	serverConfig := genericapiserver.NewConfig(Codecs)
	serverConfig.Serializer = jsonOnlyNegotiatedSerializer{Codecs}
	serverConfig.EffectiveVersion = compatibility.DefaultBuildEffectiveVersion()
	serverConfig.RequestTimeout = 24 * time.Hour
	serverConfig.MinRequestTimeout = 86400
	serverConfig.LongRunningFunc = func(r *http.Request, requestInfo *genericrequest.RequestInfo) bool {
		return requestInfo.Verb == "watch"
	}

	namer := apiopenapi.NewDefinitionNamer(Scheme)
	serverConfig.OpenAPIConfig = genericapiserver.DefaultOpenAPIConfig(GetOpenAPIDefinitions, namer)
	serverConfig.OpenAPIConfig.Info.Title = "Ark API"
	serverConfig.OpenAPIConfig.Info.Version = "v1alpha1"
	serverConfig.OpenAPIV3Config = genericapiserver.DefaultOpenAPIV3Config(GetOpenAPIDefinitions, namer)
	serverConfig.OpenAPIV3Config.Info.Title = "Ark API"
	serverConfig.OpenAPIV3Config.Info.Version = "v1alpha1"

	if err := secureServing.ApplyTo(&serverConfig.SecureServing, &serverConfig.LoopbackClientConfig); err != nil {
		return err
	}

	if s.config.AuthMode == AuthModeDelegated {
		authn := genericoptions.NewDelegatingAuthenticationOptions()
		if err := authn.ApplyTo(&serverConfig.Authentication, serverConfig.SecureServing, serverConfig.OpenAPIConfig); err != nil {
			return fmt.Errorf("failed to apply delegated authentication: %w", err)
		}
		authz := genericoptions.NewDelegatingAuthorizationOptions()
		if err := authz.ApplyTo(&serverConfig.Authorization); err != nil {
			return fmt.Errorf("failed to apply delegated authorization: %w", err)
		}
		klog.Info("Delegated authentication and authorization enabled")
	} else {
		klog.Warning("Request authentication and authorization are DISABLED (auth mode 'off'); any client that can reach the service can read and write all Ark resources")
	}

	if err := s.applyAudit(serverConfig); err != nil {
		return err
	}

	// Complete() registers the start+cache-sync poststart hook for these informers, and
	// handles nil when policy enforcement is not wired.
	admissionInformers, err := s.applyAdmission(ctx, serverConfig)
	if err != nil {
		return err
	}

	completedConfig := serverConfig.Complete(admissionInformers)
	server, err := completedConfig.New("ark-apiserver", genericapiserver.NewEmptyDelegate())
	if err != nil {
		return err
	}

	if err := s.installAPIGroups(server, converter); err != nil {
		return err
	}

	go func() {
		<-ctx.Done()
		close(s.stopCh)
		_ = s.backend.Close()
	}()

	klog.Infof("Ark API Server listening on port %d", s.config.BindPort)
	return server.PrepareRun().RunWithContext(ctx)
}

func (s *Server) installAPIGroups(server *genericapiserver.GenericAPIServer, converter storage.TypeConverter) error {
	apiGroupInfo := genericapiserver.NewDefaultAPIGroupInfo(arkv1alpha1.GroupVersion.Group, Scheme, ParameterCodec, Codecs)
	apiGroupInfo.NegotiatedSerializer = jsonOnlyNegotiatedSerializer{Codecs}

	printerColumns := GetPrinterColumnRegistry()

	lookup := &validation.StorageLookup{Backend: s.backend, K8sClient: s.config.K8sClient}
	v := validation.NewValidator(lookup)

	v1alpha1Storage := make(map[string]rest.Storage)
	for _, res := range V1Alpha1Resources {
		cfg := registry.ResourceConfig{
			Kind:         res.Kind,
			Resource:     res.Resource,
			SingularName: res.SingularName,
			NewFunc:      res.NewFunc,
			NewListFunc:  res.NewListFunc,
		}
		inner := registry.NewGenericStorage(s.backend, converter, cfg, printerColumns)
		v1alpha1Storage[res.Resource] = NewAdmissionStorage(inner, v)
		v1alpha1Storage[res.Resource+"/status"] = registry.NewStatusStorage(s.backend, converter, cfg)
	}
	apiGroupInfo.VersionedResourcesStorageMap[arkv1alpha1.GroupVersion.Version] = v1alpha1Storage

	v1prealpha1Storage := make(map[string]rest.Storage)
	for _, res := range V1PreAlpha1Resources {
		cfg := registry.ResourceConfig{
			Kind:         res.Kind,
			Resource:     res.Resource,
			SingularName: res.SingularName,
			NewFunc:      res.NewFunc,
			NewListFunc:  res.NewListFunc,
		}
		inner := registry.NewGenericStorage(s.backend, converter, cfg, printerColumns)
		v1prealpha1Storage[res.Resource] = NewAdmissionStorage(inner, v)
		v1prealpha1Storage[res.Resource+"/status"] = registry.NewStatusStorage(s.backend, converter, cfg)
	}
	apiGroupInfo.VersionedResourcesStorageMap[arkv1prealpha1.GroupVersion.Version] = v1prealpha1Storage

	if err := server.InstallAPIGroup(&apiGroupInfo); err != nil {
		return fmt.Errorf("failed to install API group: %w", err)
	}

	return nil
}

func (s *Server) NeedLeaderElection() bool {
	return false
}

func (s *Server) applyAudit(serverConfig *genericapiserver.Config) error {
	if !s.config.AuditEnabled {
		klog.Warning("Audit logging is DISABLED; the aggregated apiserver will not emit an audit trail for Ark resource operations")
		return nil
	}

	// Upstream ApplyTo leaves AuditBackend nil when PolicyFile is empty, logging only at -v=2.
	if s.config.AuditPolicyFile == "" {
		return fmt.Errorf("audit is enabled but no audit policy file is configured (ARK_APISERVER_AUDIT_POLICY_FILE): no audit records would be emitted; set a policy file or disable audit explicitly")
	}

	audit := genericoptions.NewAuditOptions()
	audit.LogOptions.Path = s.config.AuditLogPath
	audit.LogOptions.Format = "json"
	audit.PolicyFile = s.config.AuditPolicyFile
	if err := audit.ApplyTo(serverConfig); err != nil {
		return fmt.Errorf("failed to apply audit options: %w", err)
	}

	// ApplyTo can succeed while wiring no backend at all.
	if serverConfig.AuditBackend == nil {
		return fmt.Errorf("audit is enabled but no audit backend was configured from policy file %q: no audit records would be emitted", s.config.AuditPolicyFile)
	}

	klog.Infof("Audit logging enabled (policy=%q, path=%q)", s.config.AuditPolicyFile, s.config.AuditLogPath)
	return nil
}

// applyAdmission wires the ValidatingAdmissionPolicy (CEL) plugin. Policy objects live in
// the host cluster, so its informers and clients are built from RestConfig. Returns nil when
// enforcement is not wired; PolicyRequired turns those cases into a startup error.
func (s *Server) applyAdmission(ctx context.Context, serverConfig *genericapiserver.Config) (informers.SharedInformerFactory, error) {
	if s.config.RestConfig == nil {
		if s.config.PolicyRequired {
			return nil, fmt.Errorf("policy enforcement is required but no host REST config is available to build the admission plugin's clients")
		}
		klog.Warning("No host REST config available; CEL policy enforcement disabled — Ark in-process validation and audit remain active")
		return nil, nil
	}

	kubeClient, err := kubernetes.NewForConfig(s.config.RestConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to build kube client for admission: %w", err)
	}

	served, err := discoverPolicySupport(ctx, kubeClient.Discovery(), policyDiscoveryAttempts, policyDiscoveryDelay)
	switch {
	case err != nil:
		if s.config.PolicyRequired {
			return nil, fmt.Errorf("policy enforcement is required but ValidatingAdmissionPolicy support could not be determined: %w", err)
		}
		klog.Errorf("Could not determine whether the host cluster serves ValidatingAdmissionPolicy: %v. CEL policy enforcement is DISABLED for the lifetime of this process (Ark in-process validation and audit remain active). This is a fallback after a failed discovery probe, not a version check — set policy.required=true to fail startup instead of continuing unenforced.", err)
		return nil, nil
	case !served:
		if s.config.PolicyRequired {
			return nil, fmt.Errorf("policy enforcement is required but the host cluster does not serve ValidatingAdmissionPolicy (requires k8s >=1.30)")
		}
		klog.Warning("Host cluster does not serve ValidatingAdmissionPolicy (requires k8s >=1.30); CEL policy enforcement disabled — Ark in-process validation and audit remain active")
		return nil, nil
	}

	dynClient, err := dynamic.NewForConfig(s.config.RestConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to build dynamic client for admission: %w", err)
	}

	// The plugin refuses to initialise without an authorizer (it backs the `authorizer` CEL
	// variable). Auth mode "off" leaves it nil, and Complete() has not run yet.
	if serverConfig.Authorization.Authorizer == nil {
		klog.Warning("No authorizer configured (auth mode 'off'); admission policy will evaluate the authorizer CEL variable as allow-all")
		serverConfig.Authorization.Authorizer = authorizerfactory.NewAlwaysAllowAuthorizer()
	}

	admissionInformers := informers.NewSharedInformerFactory(kubeClient, 0)
	// ApplyTo needs a non-nil gate; Complete() would default it, but only later.
	serverConfig.FeatureGate = utilfeature.DefaultFeatureGate

	// The webhook plugins would call Ark's controller webhook (failurePolicy: Fail), which is
	// not deployed in apiserver-only mode, and break every write. NamespaceLifecycle would
	// judge namespace existence from this apiserver's own cache, duplicating what the host
	// already enforces on the proxied path.
	admissionOpts := genericoptions.NewAdmissionOptions()
	admissionOpts.DisablePlugins = []string{
		"NamespaceLifecycle",
		"MutatingAdmissionWebhook",
		"ValidatingAdmissionWebhook",
		"MutatingAdmissionPolicy",
	}
	if err := admissionOpts.ApplyTo(serverConfig, admissionInformers, kubeClient, dynClient, serverConfig.FeatureGate); err != nil {
		return nil, fmt.Errorf("failed to apply admission options: %w", err)
	}

	klog.Info("ValidatingAdmissionPolicy (CEL) enforcement enabled")
	return admissionInformers, nil
}

const (
	policyDiscoveryAttempts = 5
	policyDiscoveryDelay    = 2 * time.Second
)

// discoverPolicySupport retries so a host briefly unreachable during pod startup is not
// mistaken for one that cannot serve the resource.
func discoverPolicySupport(ctx context.Context, d discovery.DiscoveryInterface, attempts int, delay time.Duration) (bool, error) {
	var lastErr error
	for attempt := 1; attempt <= attempts; attempt++ {
		served, err := validatingAdmissionPolicyServed(d)
		if err == nil {
			return served, nil
		}
		lastErr = err
		klog.Warningf("ValidatingAdmissionPolicy discovery attempt %d/%d failed: %v", attempt, attempts, err)
		if attempt == attempts {
			break
		}
		select {
		case <-ctx.Done():
			return false, fmt.Errorf("discovery cancelled after %d attempts: %w", attempt, ctx.Err())
		case <-time.After(delay):
		}
	}
	return false, fmt.Errorf("discovery failed after %d attempts: %w", attempts, lastErr)
}

// validatingAdmissionPolicyServed reports whether the host serves ValidatingAdmissionPolicy
// (GA in k8s 1.30). (false, nil) means genuinely unsupported; (false, err) means unknown.
// Collapsing the two disables policy enforcement on a transient network blip.
func validatingAdmissionPolicyServed(d discovery.DiscoveryInterface) (bool, error) {
	resources, err := d.ServerResourcesForGroupVersion("admissionregistration.k8s.io/v1")
	if err != nil {
		if apierrors.IsNotFound(err) {
			return false, nil
		}
		return false, err
	}
	for _, r := range resources.APIResources {
		if r.Name == "validatingadmissionpolicies" {
			return true, nil
		}
	}
	return false, nil
}
