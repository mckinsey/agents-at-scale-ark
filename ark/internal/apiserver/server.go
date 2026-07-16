/* Copyright 2025. McKinsey & Company */

package apiserver

import (
	"context"
	"fmt"
	"net/http"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/runtime/serializer"
	utilruntime "k8s.io/apimachinery/pkg/util/runtime"
	apiopenapi "k8s.io/apiserver/pkg/endpoints/openapi"
	genericrequest "k8s.io/apiserver/pkg/endpoints/request"
	"k8s.io/apiserver/pkg/registry/rest"
	genericapiserver "k8s.io/apiserver/pkg/server"
	genericoptions "k8s.io/apiserver/pkg/server/options"
	"k8s.io/apiserver/pkg/util/compatibility"
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
	Scheme.AddKnownTypes(internalGV,
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
	Scheme.AddKnownTypes(internalGV,
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
	PostgresHost string
	PostgresPort int
	PostgresDB   string
	PostgresUser string
	PostgresPass string
	PostgresSSL  string
	BindPort     int
	AuthMode     string
	TLSCertFile  string
	TLSKeyFile   string
	K8sClient    client.Client
}

type Server struct {
	config  Config
	backend storage.Backend
	stopCh  chan struct{}
}

func New(cfg Config) *Server {
	if cfg.BindPort == 0 {
		cfg.BindPort = 6443
	}
	if cfg.AuthMode == "" {
		cfg.AuthMode = AuthModeDelegated
	}
	return &Server{
		config: cfg,
		stopCh: make(chan struct{}),
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
		Host:     s.config.PostgresHost,
		Port:     s.config.PostgresPort,
		Database: s.config.PostgresDB,
		User:     s.config.PostgresUser,
		Password: s.config.PostgresPass,
		SSLMode:  s.config.PostgresSSL,
	}
	s.backend, err = postgresql.New(cfg, converter)
	if err != nil {
		return fmt.Errorf("failed to create PostgreSQL backend: %w", err)
	}
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

	completedConfig := serverConfig.Complete(nil)
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
