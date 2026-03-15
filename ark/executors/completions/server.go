package completions

import (
	"context"
	"encoding/json"
	"net/http"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	"trpc.group/trpc-go/trpc-a2a-go/server"
	"trpc.group/trpc-go/trpc-a2a-go/taskmanager"

	"mckinsey.com/ark/internal/eventing"
	"mckinsey.com/ark/internal/telemetry"
)

var log = logf.Log.WithName("queryengine")

type Server struct {
	a2aServer  *server.A2AServer
	httpServer *http.Server
	addr       string
}

func NewServer(
	k8sClient client.Client,
	telemetryProvider telemetry.Provider,
	eventingProvider eventing.Provider,
	addr string,
) (*Server, error) {
	handler := &Handler{
		k8sClient: k8sClient,
		telemetry: telemetryProvider,
		eventing:  eventingProvider,
	}

	tm, err := taskmanager.NewMemoryTaskManager(handler)
	if err != nil {
		return nil, err
	}

	agentCard := server.AgentCard{
		Name:               "ark-completions",
		Description:        "Ark built-in query execution engine",
		URL:                "http://localhost" + addr,
		Version:            "1.0.0",
		DefaultInputModes:  []string{"text"},
		DefaultOutputModes: []string{"text"},
		Skills: []server.AgentSkill{
			{
				ID:   "query-execution",
				Name: "Query Execution",
				Tags: []string{"execution-engine"},
			},
		},
		Capabilities: server.AgentCapabilities{},
	}

	a2aSrv, err := server.NewA2AServer(agentCard, tm)
	if err != nil {
		return nil, err
	}

	return &Server{
		a2aServer: a2aSrv,
		addr:      addr,
	}, nil
}

func (s *Server) Start() error {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "healthy"})
	})
	mux.Handle("/", otelhttp.NewHandler(s.a2aServer.Handler(), "executor.completions"))

	s.httpServer = &http.Server{
		Addr:    s.addr,
		Handler: mux,
	}

	return s.httpServer.ListenAndServe()
}

func (s *Server) Stop(ctx context.Context) error {
	if s.httpServer != nil {
		return s.httpServer.Shutdown(ctx)
	}
	return nil
}
