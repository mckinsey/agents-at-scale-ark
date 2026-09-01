/* Copyright 2025. McKinsey & Company */

package apiserver

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	authorizationv1 "k8s.io/api/authorization/v1"
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
	authorizationv1client "k8s.io/client-go/kubernetes/typed/authorization/v1"
	clientrest "k8s.io/client-go/rest"
	"k8s.io/klog/v2"
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	"mckinsey.com/ark/internal/apiserver/metrics"
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
	// K8sClient reads Secrets and ConfigMaps for valueFrom parameter resolution. It is the
	// uncached reader, so a Get hits the host apiserver directly instead of populating a
	// cluster-wide informer. That keeps the apiserver ServiceAccount at get-only on those
	// resources rather than needing list and watch across every namespace.
	K8sClient client.Reader
	// RestConfig points at the host kube-apiserver, where the policy objects live.
	RestConfig *clientrest.Config
	// AuditLogPath "-" writes JSON to stdout. AuditPolicyFile is mandatory when AuditEnabled.
	AuditEnabled    bool
	AuditPolicyFile string
	AuditLogPath    string
	// CELDisabled skips CEL enforcement wiring entirely, so the apiserver never watches
	// cluster-wide policy objects. Inverted from the chart's `policy.cel.enabled` deliberately:
	// the zero value must leave enforcement on, so a Config built without this field cannot
	// end up silently unenforced.
	CELDisabled bool
	// CELRequired makes CEL enforcement a startup precondition rather than best-effort.
	CELRequired bool
	// ThirdPartyWebhooks runs the webhook admission plugins, so ValidatingWebhookConfiguration
	// and MutatingWebhookConfiguration objects — Kyverno, OPA/Gatekeeper — fire on Ark resources
	// in apiserver mode, including on the direct service path. Off by default: it puts a
	// synchronous call to every matching webhook on the write path, and Ark's own webhook
	// configurations have to be suppressed first or Ark's validation runs twice.
	ThirdPartyWebhooks bool
	// ThirdPartyWebhooksRequired is the webhook counterpart of CELRequired, and is separate from
	// it because the two mechanisms fail for unrelated reasons and a deployment can depend on
	// either alone. A cluster that mandates Kyverno on Ark resources but does not use CEL policy
	// needs strict webhooks with CEL off, which one shared flag cannot express.
	ThirdPartyWebhooksRequired bool
}

const readyzPingTimeout = 2 * time.Second

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
			Kind:          res.Kind,
			Resource:      res.Resource,
			SingularName:  res.SingularName,
			ClusterScoped: res.ClusterScoped,
			NewFunc:       res.NewFunc,
			NewListFunc:   res.NewListFunc,
		}
		inner := registry.NewGenericStorage(s.backend, converter, cfg, printerColumns)
		v1alpha1Storage[res.Resource] = NewAdmissionStorage(inner, v, lookup)
		v1alpha1Storage[res.Resource+"/status"] = registry.NewStatusStorage(s.backend, converter, cfg)
	}
	apiGroupInfo.VersionedResourcesStorageMap[arkv1alpha1.GroupVersion.Version] = v1alpha1Storage

	v1prealpha1Storage := make(map[string]rest.Storage)
	for _, res := range V1PreAlpha1Resources {
		cfg := registry.ResourceConfig{
			Kind:          res.Kind,
			Resource:      res.Resource,
			SingularName:  res.SingularName,
			ClusterScoped: res.ClusterScoped,
			NewFunc:       res.NewFunc,
			NewListFunc:   res.NewListFunc,
		}
		inner := registry.NewGenericStorage(s.backend, converter, cfg, printerColumns)
		v1prealpha1Storage[res.Resource] = NewAdmissionStorage(inner, v, lookup)
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
// enforcement is not wired; a mechanism marked required turns its own cases into a startup error.
// admissionPlan is what this apiserver will actually enforce, after config, host capability and
// RBAC have each had a chance to veto. The two mechanisms are independent: CEL policy is
// evaluated in-process, third-party webhooks are called out to, and losing one must not silently
// take the other with it.
type admissionPlan struct {
	cel      bool
	webhooks bool
}

func (p admissionPlan) any() bool { return p.cel || p.webhooks }

// anyRequired reports whether a mechanism the operator declared mandatory is still in the plan,
// so a failure that takes down every remaining mechanism at once — no REST config, for instance —
// is judged against what was actually asked for rather than against CEL alone.
func (s *Server) anyRequired(p admissionPlan) bool {
	return (p.cel && s.config.CELRequired) || (p.webhooks && s.config.ThirdPartyWebhooksRequired)
}

func (s *Server) applyAdmission(ctx context.Context, serverConfig *genericapiserver.Config) (informers.SharedInformerFactory, error) {
	// Contradictory rather than merely redundant: honouring either one silently discards the
	// operator's other instruction, and this is the class of misconfiguration where guessing
	// means serving unenforced. Checked per mechanism, because "CEL off, webhooks mandatory" is
	// a coherent request, not a contradiction.
	if s.config.CELDisabled && s.config.CELRequired {
		return nil, fmt.Errorf("CEL policy enforcement cannot be both disabled (policy.cel.enabled=false) and required (policy.cel.required=true); set at most one")
	}
	if !s.config.ThirdPartyWebhooks && s.config.ThirdPartyWebhooksRequired {
		return nil, fmt.Errorf("third-party admission webhooks cannot be both disabled (policy.thirdPartyWebhooks.enabled=false) and required (policy.thirdPartyWebhooks.required=true); set at most one")
	}

	plan := admissionPlan{cel: !s.config.CELDisabled, webhooks: s.config.ThirdPartyWebhooks}
	if !plan.any() {
		klog.Info("Admission enforcement disabled by configuration (policy.cel.enabled=false, policy.thirdPartyWebhooks.enabled=false); the apiserver will not watch cluster-wide policy or webhook objects — Ark in-process validation and audit remain active")
		return nil, nil
	}

	if s.config.RestConfig == nil {
		if s.anyRequired(plan) {
			return nil, fmt.Errorf("admission enforcement is required but no host REST config is available to build the admission plugins' clients")
		}
		klog.Warning("No host REST config available; admission enforcement disabled — Ark in-process validation and audit remain active")
		return nil, nil
	}

	kubeClient, err := kubernetes.NewForConfig(s.config.RestConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to build kube client for admission: %w", err)
	}

	if plan.cel {
		if plan.cel, err = s.resolveCELSupport(ctx, kubeClient.Discovery()); err != nil {
			return nil, err
		}
	}
	if plan, err = s.resolveWatchPermissions(ctx, kubeClient.AuthorizationV1(), plan); err != nil {
		return nil, err
	}
	if !plan.any() {
		return nil, nil
	}

	dynClient, err := dynamic.NewForConfig(s.config.RestConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to build dynamic client for admission: %w", err)
	}

	// The plugin refuses to initialise without an authorizer (it backs the `authorizer` CEL
	// variable). Auth mode "off" leaves it nil, and Complete() has not run yet.
	//
	// Note the side effect: ApplyTo reads the authorizer from this same field, which is also the
	// request-path authorizer. Setting it moves request handling from "authorization filter
	// skipped entirely" to "filter runs and permits everything" — the same effective access, but
	// it does silence the generic apiserver's own "Authorization is disabled" warning, so the
	// klog line below is the only remaining signal that auth mode 'off' is in play.
	if serverConfig.Authorization.Authorizer == nil {
		klog.Warning("No authorizer configured (auth mode 'off'); admission policy will evaluate the authorizer CEL variable as allow-all")
		serverConfig.Authorization.Authorizer = authorizerfactory.NewAlwaysAllowAuthorizer()
	}

	admissionInformers := informers.NewSharedInformerFactory(kubeClient, 0)
	// ApplyTo needs a non-nil gate; Complete() would default it, but only later.
	serverConfig.FeatureGate = utilfeature.DefaultFeatureGate

	admissionOpts, gates := s.admissionOptionsFor(plan, admissionInformers)
	if err := admissionOpts.ApplyTo(serverConfig, admissionInformers, kubeClient, dynClient, serverConfig.FeatureGate); err != nil {
		return nil, fmt.Errorf("failed to apply admission options: %w", err)
	}

	if plan.cel {
		metrics.SetEnforcementReadyFunc(metrics.MechanismCEL, gates.cel.ready)
		klog.Info("ValidatingAdmissionPolicy (CEL) enforcement enabled")
	}
	if plan.webhooks {
		metrics.SetEnforcementReadyFunc(metrics.MechanismWebhooks, gates.webhooks.ready)
		// Ark's own webhook configurations must not be present in this mode or its validation
		// runs twice; the controller chart stops rendering them when storage.backend is not etcd.
		klog.Info("Third-party admission webhooks enabled; ValidatingWebhookConfiguration/MutatingWebhookConfiguration registered by Kyverno, OPA/Gatekeeper and similar now fire on Ark resources, including on the direct service path")
	}
	return admissionInformers, nil
}

// admissionGates holds the readiness gate for each wired mechanism. They back the enforcement
// metric and select what best-effort degradation applies to; a mechanism that is off is nil.
type admissionGates struct {
	cel      *readinessGate
	webhooks *readinessGate
}

// admissionOptionsFor selects the plugins for a plan and wraps them for best-effort degradation.
// Also returns the readiness gates, which back the enforcement metric.
func (s *Server) admissionOptionsFor(plan admissionPlan, admissionInformers informers.SharedInformerFactory) (*genericoptions.AdmissionOptions, admissionGates) {
	// NamespaceLifecycle would judge namespace existence from this apiserver's own cache,
	// duplicating what the host already enforces on the proxied path. MutatingAdmissionPolicy is
	// out of scope: Ark applies its own defaulting in the storage path.
	opts := genericoptions.NewAdmissionOptions()
	opts.DisablePlugins = []string{"NamespaceLifecycle", "MutatingAdmissionPolicy"}
	if !plan.cel {
		opts.DisablePlugins = append(opts.DisablePlugins, validatingAdmissionPolicyPlugin)
	}
	if !plan.webhooks {
		opts.DisablePlugins = append(opts.DisablePlugins, mutatingAdmissionWebhookPlugin, validatingAdmissionWebhookPlugin)
	}

	// Build a gate only for what is actually wired. Constructing one registers its informers on
	// the shared factory and Complete() starts everything registered, so a gate built for a
	// disabled mechanism leaves a reflector retrying a Forbidden list for the life of the process.
	var gates admissionGates
	if plan.cel {
		gates.cel = newPolicyReadinessGate(admissionInformers)
	}
	if plan.webhooks {
		gates.webhooks = newWebhookReadinessGate(admissionInformers)
	}

	// Best-effort mode short-circuits to allow when a plugin's informers have not synced; required
	// mode leaves that mechanism's plugins unwrapped so they keep failing closed. Selected per
	// mechanism, so requiring one does not quietly harden the other. Gates are still built for a
	// required mechanism — the metric samples them either way.
	degrade := map[string]*readinessGate{}
	if plan.cel && !s.config.CELRequired {
		degrade[validatingAdmissionPolicyPlugin] = gates.cel
	}
	if plan.webhooks && !s.config.ThirdPartyWebhooksRequired {
		degrade[validatingAdmissionWebhookPlugin] = gates.webhooks
		degrade[mutatingAdmissionWebhookPlugin] = gates.webhooks
	}

	// Appended, not assigned: NewAdmissionOptions seeds Decorators with WithControllerMetrics.
	if len(degrade) > 0 {
		opts.Decorators = append(opts.Decorators, bestEffortDecorator(degrade))
	}
	return opts, gates
}

// resolveCELSupport reports whether CEL policy can be wired, honouring CELRequired: a host
// that cannot serve ValidatingAdmissionPolicy is a startup error when CEL policy is required and a
// logged fallback otherwise.
func (s *Server) resolveCELSupport(ctx context.Context, d discovery.DiscoveryInterface) (bool, error) {
	served, err := discoverPolicySupport(ctx, d, policyDiscoveryAttempts, policyDiscoveryDelay)
	switch {
	case err != nil:
		if s.config.CELRequired {
			return false, fmt.Errorf("CEL policy enforcement is required but ValidatingAdmissionPolicy support could not be determined: %w", err)
		}
		klog.Errorf("Could not determine whether the host cluster serves ValidatingAdmissionPolicy: %v. CEL policy enforcement is DISABLED for the lifetime of this process (Ark in-process validation and audit remain active). This is a fallback after a failed discovery probe, not a version check — set policy.cel.required=true to fail startup instead of continuing unenforced.", err)
		return false, nil
	case !served:
		if s.config.CELRequired {
			return false, fmt.Errorf("CEL policy enforcement is required but the host cluster does not serve ValidatingAdmissionPolicy (requires k8s >=1.30)")
		}
		klog.Warning("Host cluster does not serve ValidatingAdmissionPolicy (requires k8s >=1.30); CEL policy enforcement disabled — Ark in-process validation and audit remain active")
		return false, nil
	}
	return true, nil
}

// resolveWatchPermissions drops whichever mechanisms the ServiceAccount cannot watch for. Checked
// separately so a missing grant for one does not silently disable the other.
func (s *Server) resolveWatchPermissions(ctx context.Context, c authorizationv1client.AuthorizationV1Interface, plan admissionPlan) (admissionPlan, error) {
	if plan.cel {
		if err := checkWatchPermissions(ctx, c, policyWatchResources, "ark-apiserver-admission-policy"); err != nil {
			if s.config.CELRequired {
				return plan, fmt.Errorf("CEL policy enforcement is required but %w", err)
			}
			klog.Errorf("%v. CEL policy enforcement is DISABLED for the lifetime of this process (Ark in-process validation and audit remain active) — set policy.cel.required=true to fail startup instead of continuing unenforced.", err)
			plan.cel = false
		}
	}
	if plan.webhooks {
		if err := checkWatchPermissions(ctx, c, webhookWatchResources, "ark-apiserver-admission-webhooks"); err != nil {
			if s.config.ThirdPartyWebhooksRequired {
				return plan, fmt.Errorf("third-party admission webhooks are required but %w", err)
			}
			klog.Errorf("%v. Third-party admission webhooks are DISABLED for the lifetime of this process (Ark in-process validation and audit remain active) — set policy.thirdPartyWebhooks.required=true to fail startup instead of continuing unenforced.", err)
			plan.webhooks = false
		}
	}
	return plan, nil
}

// policyWatchResources are the watches the ValidatingAdmissionPolicy plugin's informers open
// against the host cluster. All three are load-bearing: the plugin is not ready until both the
// policy source and the namespace informer have synced, and an unready plugin does not degrade
// — it holds each write in WaitForReady for up to 10s and then rejects it with Forbidden. So a
// missing ClusterRoleBinding would otherwise surface as slow, opaque 403s on every write rather
// than as the documented best-effort fallback.
var policyWatchResources = []authorizationv1.ResourceAttributes{
	{Group: "admissionregistration.k8s.io", Resource: "validatingadmissionpolicies", Verb: "watch"},
	{Group: "admissionregistration.k8s.io", Resource: "validatingadmissionpolicybindings", Verb: "watch"},
	{Group: "", Resource: "namespaces", Verb: "watch"},
}

// webhookWatchResources are the watches the MutatingAdmissionWebhook/ValidatingAdmissionWebhook
// plugins open (admission/configuration/{mutating,validating}_webhook_manager.go). Same failure
// shape as the policy watches: without them the managers never sync and every write stalls.
var webhookWatchResources = []authorizationv1.ResourceAttributes{
	{Group: "admissionregistration.k8s.io", Resource: "validatingwebhookconfigurations", Verb: "watch"},
	{Group: "admissionregistration.k8s.io", Resource: "mutatingwebhookconfigurations", Verb: "watch"},
	// Webhook matching evaluates namespaceSelector, so this is load-bearing here as well.
	{Group: "", Resource: "namespaces", Verb: "watch"},
}

// checkWatchPermissions confirms the apiserver's ServiceAccount can watch what a plugin's
// informers watch, so a missing grant lands on the same fallback as an unsupported host. The
// review itself needs no extra RBAC: system:basic-user grants selfsubjectaccessreviews to every
// authenticated identity. It only covers the grant existing now — a binding deleted later still
// fails at request time, which is what that mechanism's `required` is for.
func checkWatchPermissions(ctx context.Context, c authorizationv1client.AuthorizationV1Interface, resources []authorizationv1.ResourceAttributes, boundBy string) error {
	for _, attrs := range resources {
		review := &authorizationv1.SelfSubjectAccessReview{
			Spec: authorizationv1.SelfSubjectAccessReviewSpec{ResourceAttributes: &attrs},
		}
		result, err := c.SelfSubjectAccessReviews().Create(ctx, review, metav1.CreateOptions{})
		if err != nil {
			return fmt.Errorf("could not verify permission to %s %s: %w", attrs.Verb, policyResourceLabel(attrs), err)
		}
		if !result.Status.Allowed {
			reason := result.Status.Reason
			if reason == "" {
				reason = "not permitted by RBAC"
			}
			return fmt.Errorf("the apiserver ServiceAccount cannot %s %s (%s); the %s ClusterRoleBinding is missing or was removed",
				attrs.Verb, policyResourceLabel(attrs), reason, boundBy)
		}
	}
	return nil
}

func policyResourceLabel(a authorizationv1.ResourceAttributes) string {
	if a.Group == "" {
		return a.Resource
	}
	return a.Resource + "." + a.Group
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

func (s *Server) Readyz(r *http.Request) error {
	return storageReady(r.Context(), s.backendReady, func(ctx context.Context) error { return s.backend.Ping(ctx) })
}

func storageReady(parent context.Context, ready <-chan struct{}, ping func(context.Context) error) error {
	select {
	case <-ready:
	default:
		return errors.New("storage backend not initialized")
	}
	ctx, cancel := context.WithTimeout(parent, readyzPingTimeout)
	defer cancel()

	// The ping runs on its own goroutine because lib/pq observes only its connect_timeout
	// while establishing a connection: against an unreachable or wedged database the ping
	// ignores ctx and returns after connect_timeout, 5x readyzPingTimeout. Waiting on ctx
	// here keeps the probe response bounded and lets kubelet-side cancellation land, while
	// the abandoned ping releases its pool connection when the driver gives up.
	done := make(chan error, 1)
	go func() { done <- ping(ctx) }()

	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		return fmt.Errorf("storage backend ping did not complete: %w", ctx.Err())
	}
}
