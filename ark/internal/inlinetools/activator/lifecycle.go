/* Copyright 2025. McKinsey & Company */

package activator

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"sync"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	appsv1 "k8s.io/api/apps/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/util/validation"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/log"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/inlinetools"
	"mckinsey.com/ark/internal/inlinetools/runner"
)

const (
	activationTimeout = 60 * time.Second
	idleTimeout       = 60 * time.Second
)

type activity struct {
	key            types.NamespacedName
	uid            types.UID
	gate           chan struct{}
	calls          int // Pending and active calls both exclude idle scale-down.
	lastCompletion time.Time
}

// Activator is the one scaling authority. Discovery uses its separate Handler;
// only Invoke registers activity. Run must run for the server's lifetime.
type Activator struct {
	http.Handler
	client            client.Client
	namespace         string
	namespaces        []string
	httpClient        *http.Client
	activationTimeout time.Duration
	executionTimeout  time.Duration
	pollInterval      time.Duration
	mu                sync.Mutex
	activity          map[types.UID]*activity
}

func New(ctx context.Context, kube client.Client, namespace string, namespaces []string) (*Activator, error) {
	if len(validation.IsDNS1123Label(namespace)) != 0 {
		return nil, fmt.Errorf("a valid activator namespace is required")
	}
	a := &Activator{
		client: kube, namespace: namespace, namespaces: slices.Clone(namespaces), activity: map[types.UID]*activity{},
		activationTimeout: activationTimeout, executionTimeout: runner.ExecutionTimeout, pollInterval: 250 * time.Millisecond,
		httpClient: &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }},
	}
	var err error
	a.Handler, err = Handler(kube, namespaces, a.Invoke)
	if err != nil {
		return nil, err
	}
	if err := a.recover(ctx); err != nil {
		return nil, err
	}
	return a, nil
}

func (a *Activator) Invoke(ctx context.Context, key types.NamespacedName, uid types.UID, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	if req == nil || req.Params == nil {
		return nil, fmt.Errorf("tool call parameters are required")
	}
	argument, err := runner.CompactArgument(req.Params.Arguments)
	if err != nil {
		return nil, err
	}
	activationCtx, cancelActivation := context.WithTimeout(ctx, a.activationTimeout)
	defer cancelActivation()
	initial, err := a.resolve(activationCtx, key, uid, req.Params.Name)
	if err != nil {
		return nil, err
	}
	a.mu.Lock()
	state := a.record(key, uid)
	state.calls++
	a.mu.Unlock()
	defer func() {
		a.mu.Lock()
		state.calls--
		state.lastCompletion = time.Now()
		a.mu.Unlock()
	}()

	// The per-Tool gate coalesces cold starts without serializing script calls.
	select {
	case state.gate <- struct{}{}:
	case <-activationCtx.Done():
		return nil, activationCtx.Err()
	}
	current, err := a.activate(activationCtx, initial)
	<-state.gate
	if err != nil {
		return nil, err
	}
	mcpClient := mcp.NewClient(&mcp.Implementation{Name: inlinetools.ActivatorName, Version: "v1"}, nil)
	session, err := mcpClient.Connect(activationCtx, &mcp.StreamableClientTransport{
		Endpoint: current.address, HTTPClient: a.httpClient, MaxRetries: -1, DisableStandaloneSSE: true,
	}, nil)
	if err != nil {
		return nil, fmt.Errorf("connect to inline runner: %w", err)
	}
	defer func() { _ = session.Close() }()
	// A rollout or disable during the handshake must not execute the old target.
	if _, err := a.currentReady(activationCtx, initial); err != nil {
		return nil, err
	}
	cancelActivation()
	executionCtx, cancelExecution := context.WithTimeout(ctx, a.executionTimeout)
	defer cancelExecution()
	if err := executionCtx.Err(); err != nil {
		return nil, err
	}
	// One send only. A lost response is uncertain execution, never a replay.
	return session.CallTool(executionCtx, &mcp.CallToolParams{Name: key.Name, Arguments: json.RawMessage(argument)})
}

// record runs during construction or with mu held. Recovered warm runners get
// a full idle grace period; discovery cannot create or update an entry.
func (a *Activator) record(key types.NamespacedName, uid types.UID) *activity {
	state := a.activity[uid]
	if state == nil {
		state = &activity{key: key, uid: uid, gate: make(chan struct{}, 1), lastCompletion: time.Now()}
		a.activity[uid] = state
	}
	return state
}

func (a *Activator) recover(ctx context.Context) error {
	for _, namespace := range a.namespaces {
		deployments := &appsv1.DeploymentList{}
		if err := a.client.List(ctx, deployments, client.InNamespace(namespace), client.MatchingLabels{
			"app.kubernetes.io/name": "ark-inline-runner", "app.kubernetes.io/managed-by": "ark-controller",
		}); err != nil {
			return fmt.Errorf("recover inline runners: %w", err)
		}
		for i := range deployments.Items {
			deployment := &deployments.Items[i]
			owner := metav1.GetControllerOf(deployment)
			if owner == nil || owner.Kind != "Tool" || owner.APIVersion != arkv1alpha1.GroupVersion.String() ||
				deployment.Spec.Replicas == nil || *deployment.Spec.Replicas == 0 {
				continue
			}
			tool := &arkv1alpha1.Tool{}
			key := types.NamespacedName{Namespace: namespace, Name: owner.Name}
			if err := a.client.Get(ctx, key, tool); err != nil {
				if apierrors.IsNotFound(err) {
					continue
				}
				return err
			}
			if inlinetools.OwnsRunner(deployment, tool) {
				a.record(key, tool.UID)
			}
		}
	}
	return nil
}

func (a *Activator) Run(ctx context.Context) error {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil
		case now := <-ticker.C:
			if err := a.sweep(ctx, now); err != nil {
				log.FromContext(ctx).Error(err, "inline idle scale-down failed")
			}
		}
	}
}

func (a *Activator) sweep(ctx context.Context, now time.Time) error {
	if !inlinetools.Enabled() {
		return nil // The controller owns bounded drain while disabled.
	}
	a.mu.Lock()
	states := make([]*activity, 0, len(a.activity))
	for _, state := range a.activity {
		states = append(states, state)
	}
	a.mu.Unlock()
	var failures []error
	for _, state := range states {
		a.mu.Lock()
		if state.calls != 0 || now.Sub(state.lastCompletion) < idleTimeout {
			a.mu.Unlock()
			continue
		}
		select {
		case state.gate <- struct{}{}:
		default:
			a.mu.Unlock()
			continue
		}
		a.mu.Unlock()
		// New calls may register while this write runs, but must acquire the
		// same gate before activation. No API I/O holds the global mutex.
		scaleCtx, cancel := context.WithTimeout(ctx, a.activationTimeout)
		err := a.scaleIdle(scaleCtx, state)
		cancel()
		a.mu.Lock()
		if err == nil && state.calls == 0 && a.activity[state.uid] == state {
			delete(a.activity, state.uid)
		}
		a.mu.Unlock()
		<-state.gate
		if err != nil {
			failures = append(failures, err)
		}
	}
	return errors.Join(failures...)
}
