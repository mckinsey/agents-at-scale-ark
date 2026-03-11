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

func init() {
	utilruntime.Must(arkv1alpha1.AddToScheme(Scheme))
	utilruntime.Must(arkv1prealpha1.AddToScheme(Scheme))
	utilruntime.Must(metav1.AddMetaToScheme(Scheme))
	metav1.AddToGroupVersion(Scheme, schema.GroupVersion{Group: "", Version: "v1"})
}

type Config struct {
	PostgresHost string
	PostgresPort int
	PostgresDB   string
	PostgresUser string
	PostgresPass string
	PostgresSSL  string
	BindPort     int
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
	return &Server{
		config: cfg,
		stopCh: make(chan struct{}),
	}
}

func (s *Server) Start(ctx context.Context) error {
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

	if err := secureServing.MaybeDefaultWithSelfSignedCerts("localhost", nil, nil); err != nil {
		return fmt.Errorf("error creating self-signed certificates: %v", err)
	}

	serverConfig := genericapiserver.NewConfig(Codecs)
	serverConfig.EffectiveVersion = compatibility.DefaultBuildEffectiveVersion()
	serverConfig.RequestTimeout = 24 * time.Hour
	serverConfig.MinRequestTimeout = 86400
	serverConfig.LongRunningFunc = func(r *http.Request, requestInfo *genericrequest.RequestInfo) bool {
		return true
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
