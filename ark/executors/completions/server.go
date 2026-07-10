package completions

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sync/atomic"
	"time"

	"github.com/redis/go-redis/v9"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	"trpc.group/trpc-go/trpc-a2a-go/server"
	"trpc.group/trpc-go/trpc-a2a-go/taskmanager"
	redistm "trpc.group/trpc-go/trpc-a2a-go/taskmanager/redis"

	"mckinsey.com/ark/internal/eventing"
	"mckinsey.com/ark/internal/telemetry"
)

var log = logf.Log.WithName("queryengine")

// finalizeGrace is the short window granted, after the drain deadline is hit, for
// lingering executions to finalize their event stream before the process exits. The
// pod's terminationGracePeriodSeconds must budget for preStop + --shutdown-timeout +
// finalizeGrace + buffer so this window never pushes shutdown past the SIGKILL (see the
// chart's gracefulShutdown values).
const finalizeGrace = 2 * time.Second

// Redis connection retry at boot. A shared-Redis blip (failover/restart) must not
// crashloop the whole fleet synchronously, so tolerate transient unavailability with a
// bounded retry before failing startup. Kept well inside the liveness failure budget.
const (
	redisConnectAttempts = 3
	redisConnectBackoff  = 2 * time.Second
)

// ServerConfig configures the completions server, including how A2A task state is stored.
type ServerConfig struct {
	Addr string

	// RedisURL, when non-empty, selects the shared Redis-backed A2A TaskManager so task
	// state (status/history/artifacts) is visible across replicas — required for external
	// A2A clients doing tasks/get, tasks/resubscribe, or stream re-attach under HPA-driven
	// multi-pod deployments. Empty falls back to the per-process in-memory TaskManager,
	// which is correct for single-pod installs and the controller's blocking dispatch path.
	RedisURL string
	// RedisPassword, when set, overrides any password embedded in RedisURL.
	RedisPassword string
	// TaskExpiry bounds how long task/conversation state lives in Redis (0 = library default).
	TaskExpiry time.Duration
}

type Server struct {
	a2aServer  *server.A2AServer
	httpServer *http.Server
	addr       string

	// ready gates the readiness probe. It is flipped to false at the start of shutdown so
	// load balancers stop routing new requests to a terminating pod before in-flight work
	// is drained.
	ready atomic.Bool

	// shutdownCancel cancels the server lifetime context once the drain window closes,
	// signalling any lingering in-flight executions (notably long-lived streams) to stop
	// and run their finalize path — closing the stream cleanly — instead of being severed
	// on process exit.
	shutdownCancel context.CancelFunc
}

// buildTaskManager selects the A2A task manager based on config: a shared Redis-backed
// manager when a Redis URL is provided, otherwise the in-memory manager.
func buildTaskManager(cfg ServerConfig, processor taskmanager.MessageProcessor) (taskmanager.TaskManager, error) {
	if cfg.RedisURL == "" {
		log.Info("using in-memory A2A task manager; set redis to share task state across replicas")
		return taskmanager.NewMemoryTaskManager(processor)
	}

	opt, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return nil, fmt.Errorf("invalid redis URL: %w", err)
	}
	if cfg.RedisPassword != "" {
		opt.Password = cfg.RedisPassword
	}
	redisClient := redis.NewClient(opt)

	var opts []redistm.TaskManagerOption
	if cfg.TaskExpiry > 0 {
		opts = append(opts, redistm.WithExpireTime(cfg.TaskExpiry))
	}

	// NewTaskManager pings Redis synchronously and hard-fails if it is unreachable. Retry
	// with backoff so a transient blip at boot doesn't crashloop every replica at once; a
	// permanent misconfig still fails fast after the bounded attempts.
	var tm taskmanager.TaskManager
	var lastErr error
	for attempt := 1; attempt <= redisConnectAttempts; attempt++ {
		tm, lastErr = redistm.NewTaskManager(redisClient, processor, opts...)
		if lastErr == nil {
			break
		}
		log.Error(lastErr, "redis task manager init failed", "attempt", attempt, "maxAttempts", redisConnectAttempts, "addr", opt.Addr)
		if attempt < redisConnectAttempts {
			time.Sleep(redisConnectBackoff)
		}
	}
	if lastErr != nil {
		return nil, fmt.Errorf("failed to create redis task manager after %d attempts: %w", redisConnectAttempts, lastErr)
	}
	log.Info("using redis-backed A2A task manager", "addr", opt.Addr, "db", opt.DB)
	return tm, nil
}

func NewServer(
	k8sClient client.Client,
	telemetryProvider telemetry.Provider,
	eventingProvider eventing.Provider,
	cfg ServerConfig,
) (*Server, error) {
	shutdownCtx, shutdownCancel := context.WithCancel(context.Background())

	handler := &Handler{
		k8sClient: k8sClient,
		telemetry: telemetryProvider,
		eventing:  eventingProvider,
		baseCtx:   shutdownCtx,
	}

	tm, err := buildTaskManager(cfg, handler)
	if err != nil {
		shutdownCancel()
		return nil, err
	}

	agentCard := server.AgentCard{
		Name:               "ark-completions",
		Description:        "Ark built-in query execution engine",
		URL:                "http://localhost" + cfg.Addr,
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
		shutdownCancel()
		return nil, err
	}

	s := &Server{
		a2aServer:      a2aSrv,
		addr:           cfg.Addr,
		shutdownCancel: shutdownCancel,
	}
	s.ready.Store(true)
	return s, nil
}

func (s *Server) Start() error {
	mux := http.NewServeMux()
	// Liveness: always healthy while the process is up.
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "healthy"})
	})
	// Readiness: reports not-ready during shutdown so the pod is removed from Service
	// endpoints before in-flight requests are drained.
	mux.HandleFunc("/ready", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if !s.ready.Load() {
			w.WriteHeader(http.StatusServiceUnavailable)
			_ = json.NewEncoder(w).Encode(map[string]string{"status": "shutting-down"})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ready"})
	})
	mux.Handle("/", otelhttp.NewHandler(s.a2aServer.Handler(), "executor.completions"))

	s.httpServer = &http.Server{
		Addr:    s.addr,
		Handler: mux,
	}

	return s.httpServer.ListenAndServe()
}

// SetNotReady flips the readiness probe to failing. main calls this on receipt of a
// termination signal, before Stop, so /ready reports not-ready as early as possible while
// in-flight work drains. Stop also flips it defensively as its first action.
func (s *Server) SetNotReady() {
	s.ready.Store(false)
}

func (s *Server) Stop(ctx context.Context) error {
	s.ready.Store(false)
	if s.httpServer == nil {
		s.shutdownCancel()
		return nil
	}

	// Shutdown stops accepting new connections and waits for in-flight requests to finish,
	// bounded by ctx. It does not cancel their request contexts.
	err := s.httpServer.Shutdown(ctx)

	// Drain window closed. Signal any still-running executions to stop and finalize.
	s.shutdownCancel()
	if errors.Is(err, context.DeadlineExceeded) {
		// Work was still in flight at the deadline: give the signalled executions a brief
		// window to close their streams cleanly before the process exits.
		time.Sleep(finalizeGrace)
	}
	return err
}
