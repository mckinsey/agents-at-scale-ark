/* Copyright 2025. McKinsey & Company */

package activator

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	appsv1 "k8s.io/api/apps/v1"
	autoscalingv1 "k8s.io/api/autoscaling/v1"
	corev1 "k8s.io/api/core/v1"
	discoveryv1 "k8s.io/api/discovery/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/util/intstr"
	"k8s.io/utils/ptr"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
	"sigs.k8s.io/controller-runtime/pkg/client/interceptor"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/inlinetools"
	"mckinsey.com/ark/internal/inlinetools/runner"
	inlinetransport "mckinsey.com/ark/internal/inlinetools/transport"
)

type runnerFixture struct {
	tool       *arkv1alpha1.Tool
	deployment *appsv1.Deployment
	service    *corev1.Service
	pod        *corev1.Pod
	rs         *appsv1.ReplicaSet
	endpoints  *discoveryv1.EndpointSlice
}

func lifeFixture(name string, replicas int32) *runnerFixture {
	tool := discoveryTool()
	tool.Name, tool.UID, tool.Generation = name, types.UID(name+"-uid"), 1
	tool.Status = arkv1alpha1.ToolStatus{
		State:           arkv1alpha1.ToolStateReady,
		ResolvedAddress: inlinetools.ResolvedAddress("ark-system", tool), Conditions: []metav1.Condition{{
			Type: arkv1alpha1.ToolConditionAvailable, Status: metav1.ConditionTrue, Reason: arkv1alpha1.ToolReasonAvailable, ObservedGeneration: 1,
		}},
	}
	child := inlinetools.NamesFor(name).Runner
	metadata := metav1.ObjectMeta{
		Name: child, Namespace: tool.Namespace, UID: types.UID(child + "-uid"), Generation: 1,
		Labels: inlinetools.RunnerLabels(tool), OwnerReferences: []metav1.OwnerReference{*metav1.NewControllerRef(tool, arkv1alpha1.GroupVersion.WithKind("Tool"))},
	}
	hash := runner.SourceHash(tool.Spec.Inline.Source)
	deployment := &appsv1.Deployment{ObjectMeta: *metadata.DeepCopy(), Spec: appsv1.DeploymentSpec{
		Replicas: ptr.To(replicas), Selector: &metav1.LabelSelector{MatchLabels: inlinetools.RunnerLabels(tool)},
		Template: corev1.PodTemplateSpec{
			ObjectMeta: metav1.ObjectMeta{Labels: inlinetools.RunnerLabels(tool), Annotations: map[string]string{inlinetools.SourceHashAnnotation: hash}},
			Spec: corev1.PodSpec{Containers: []corev1.Container{{Name: "runner", Image: "runner:test", Env: []corev1.EnvVar{
				{Name: runner.EnvToolName, Value: name}, {Name: runner.EnvLanguage, Value: tool.Spec.Inline.Language}, {Name: runner.EnvSourceHash, Value: hash},
			}}}},
		},
	}, Status: appsv1.DeploymentStatus{ObservedGeneration: 1, Replicas: 1, UpdatedReplicas: 1, ReadyReplicas: 1, AvailableReplicas: 1}}
	service := &corev1.Service{ObjectMeta: *metadata.DeepCopy(), Spec: corev1.ServiceSpec{
		Type: corev1.ServiceTypeClusterIP, ClusterIP: "10.43.0.1",
		Selector: inlinetools.RunnerLabels(tool), Ports: []corev1.ServicePort{{Name: "http", Port: 8080, Protocol: corev1.ProtocolTCP, TargetPort: intstr.FromInt32(8080)}},
	}}
	rs := &appsv1.ReplicaSet{ObjectMeta: metav1.ObjectMeta{
		Name: child + "-rs", Namespace: tool.Namespace, UID: types.UID(child + "-rs-uid"),
		OwnerReferences: []metav1.OwnerReference{*metav1.NewControllerRef(deployment, appsv1.SchemeGroupVersion.WithKind("Deployment"))},
	}}
	pod := &corev1.Pod{
		ObjectMeta: *deployment.Spec.Template.ObjectMeta.DeepCopy(), Spec: *deployment.Spec.Template.Spec.DeepCopy(),
		Status: corev1.PodStatus{PodIP: "10.42.0.2", Conditions: []corev1.PodCondition{{Type: corev1.PodReady, Status: corev1.ConditionTrue}}},
	}
	pod.Name, pod.Namespace, pod.UID = child+"-pod", tool.Namespace, types.UID(child+"-pod-uid")
	pod.OwnerReferences = []metav1.OwnerReference{*metav1.NewControllerRef(rs, appsv1.SchemeGroupVersion.WithKind("ReplicaSet"))}
	endpoints := &discoveryv1.EndpointSlice{
		ObjectMeta: metav1.ObjectMeta{
			Name: child + "-endpoints", Namespace: tool.Namespace,
			Labels: map[string]string{discoveryv1.LabelServiceName: child}, OwnerReferences: []metav1.OwnerReference{*metav1.NewControllerRef(service, corev1.SchemeGroupVersion.WithKind("Service"))},
		},
		AddressType: discoveryv1.AddressTypeIPv4,
		Ports:       []discoveryv1.EndpointPort{{Name: ptr.To("http"), Port: ptr.To(int32(8080)), Protocol: ptr.To(corev1.ProtocolTCP)}},
		Endpoints: []discoveryv1.Endpoint{{
			Addresses: []string{pod.Status.PodIP}, Conditions: discoveryv1.EndpointConditions{Ready: ptr.To(true)},
			TargetRef: &corev1.ObjectReference{Kind: "Pod", Namespace: pod.Namespace, Name: pod.Name, UID: pod.UID},
		}},
	}
	return &runnerFixture{tool, deployment, service, pod, rs, endpoints}
}

func (f *runnerFixture) objects() []client.Object {
	return []client.Object{f.tool, f.deployment, f.service, f.rs, f.pod, f.endpoints}
}

func lifeActivator(t *testing.T, fixtures ...*runnerFixture) (*Activator, *atomic.Int32) {
	t.Helper()
	t.Setenv(inlinetools.EnabledEnvVar, "true")
	scheme := runtime.NewScheme()
	for _, add := range []func(*runtime.Scheme) error{arkv1alpha1.AddToScheme, appsv1.AddToScheme, corev1.AddToScheme, discoveryv1.AddToScheme, autoscalingv1.AddToScheme} {
		require.NoError(t, add(scheme))
	}
	var objects []client.Object
	for _, fixture := range fixtures {
		objects = append(objects, fixture.objects()...)
	}
	var scales atomic.Int32
	kube := fake.NewClientBuilder().WithScheme(scheme).WithObjects(objects...).WithStatusSubresource(&arkv1alpha1.Tool{}).WithInterceptorFuncs(interceptor.Funcs{
		SubResourceUpdate: func(ctx context.Context, c client.Client, subresource string, object client.Object, opts ...client.SubResourceUpdateOption) error {
			assert.Equal(t, "scale", subresource, "no full Deployment or Tool writes")
			assert.IsType(t, &appsv1.Deployment{}, object)
			options := &client.SubResourceUpdateOptions{}
			for _, opt := range opts {
				opt.ApplyToSubResourceUpdate(options)
			}
			body, ok := options.SubResourceBody.(*autoscalingv1.Scale)
			if !assert.True(t, ok) {
				return fmt.Errorf("missing Scale body")
			}
			assert.NotEmpty(t, body.UID)
			assert.Equal(t, object.GetUID(), body.UID)
			assert.NotEmpty(t, body.ResourceVersion)
			scales.Add(1)
			return c.SubResource(subresource).Update(ctx, object, opts...)
		},
	}).Build()
	a, err := New(context.Background(), kube, "ark-system", []string{"tenant"})
	require.NoError(t, err)
	a.pollInterval = time.Millisecond
	return a, &scales
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func backendServer(t *testing.T, a *Activator, name string, handler mcp.ToolHandler) *atomic.Int32 {
	t.Helper()
	server := mcp.NewServer(&mcp.Implementation{Name: "runner", Version: "v1"}, nil)
	server.AddTool(&mcp.Tool{Name: name, InputSchema: json.RawMessage(`{"type":"object"}`)}, func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		// Independent teardown bound, not evidence of cancellation propagation.
		ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
		defer cancel()
		return handler(ctx, req)
	})
	httpServer := httptest.NewServer(inlinetransport.Handler(server))
	t.Cleanup(httpServer.Close)
	endpoint, err := url.Parse(httpServer.URL)
	require.NoError(t, err)
	var requests atomic.Int32
	a.httpClient.Transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		requests.Add(1)
		assert.Equal(t, inlinetools.NamesFor(name).Runner+".tenant.svc.cluster.local:8080", r.URL.Host)
		assert.Equal(t, "/mcp", r.URL.Path)
		copy := r.Clone(r.Context())
		copy.URL.Scheme, copy.URL.Host = endpoint.Scheme, endpoint.Host
		copy.Host = endpoint.Host
		return http.DefaultTransport.RoundTrip(copy)
	})
	return &requests
}

func invoke(a *Activator, ctx context.Context, fixture *runnerFixture) (*mcp.CallToolResult, error) {
	return a.Invoke(ctx, client.ObjectKeyFromObject(fixture.tool), fixture.tool.UID, &mcp.CallToolRequest{Params: &mcp.CallToolParamsRaw{Name: fixture.tool.Name, Arguments: json.RawMessage(`{"value":9007199254740993}`)}})
}

func storedReplicas(t *testing.T, a *Activator, fixture *runnerFixture) int32 {
	t.Helper()
	deployment := &appsv1.Deployment{}
	require.NoError(t, a.client.Get(context.Background(), client.ObjectKeyFromObject(fixture.deployment), deployment))
	return *deployment.Spec.Replicas
}

func TestActivatorCoalescesColdStartsAndProtectsPendingAndActiveCalls(t *testing.T) {
	chosen, unused := lifeFixture("chosen", 0), lifeFixture("unused", 0)
	a, scales := lifeActivator(t, chosen, unused)
	const callers = 8
	started := make(chan struct{}, callers)
	release := make(chan struct{})
	backendServer(t, a, chosen.tool.Name, func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		assert.Equal(t, `{"value":9007199254740993}`, string(req.Params.Arguments))
		started <- struct{}{}
		select {
		case <-release:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
		return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: "done"}}}, nil
	})
	var wg sync.WaitGroup
	errors := make(chan error, callers)
	for range callers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			result, err := invoke(a, context.Background(), chosen)
			if err == nil && result.IsError {
				err = fmt.Errorf("unexpected tool error")
			}
			errors <- err
		}()
	}
	for range callers {
		select {
		case <-started:
		case <-time.After(5 * time.Second):
			t.Fatal("call did not reach backend")
		}
	}
	require.NoError(t, a.sweep(context.Background(), time.Now().Add(2*idleTimeout)))
	assert.EqualValues(t, 1, scales.Load())
	assert.EqualValues(t, 1, storedReplicas(t, a, chosen))
	assert.Zero(t, storedReplicas(t, a, unused))
	close(release)
	wg.Wait()
	close(errors)
	for err := range errors {
		require.NoError(t, err)
	}
	a.mu.Lock()
	completion := a.activity[chosen.tool.UID].lastCompletion
	assert.Zero(t, a.activity[chosen.tool.UID].calls)
	a.mu.Unlock()
	require.NoError(t, a.sweep(context.Background(), completion.Add(idleTimeout-time.Nanosecond)))
	assert.EqualValues(t, 1, storedReplicas(t, a, chosen))
	listing := rpc(t, a, "/mcp/tenant/chosen/chosen-uid", `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`)
	assert.Equal(t, http.StatusOK, listing.Code)
	require.NoError(t, a.sweep(context.Background(), completion.Add(idleTimeout)))
	assert.Zero(t, storedReplicas(t, a, chosen))
	assert.EqualValues(t, 2, scales.Load())
	assert.Empty(t, a.activity)
}

func TestActivatorRejectsInvalidCallsBeforeScaling(t *testing.T) {
	for _, arguments := range []string{`[]`, `"text"`, `false`, `{`, `{"text":"` + strings.Repeat("x", runner.MaxArgumentBytes) + `"}`} {
		t.Run(arguments[:min(len(arguments), 12)], func(t *testing.T) {
			fixture := lifeFixture("echo", 0)
			a, scales := lifeActivator(t, fixture)
			_, err := a.Invoke(context.Background(), client.ObjectKeyFromObject(fixture.tool), fixture.tool.UID, &mcp.CallToolRequest{Params: &mcp.CallToolParamsRaw{Name: "echo", Arguments: json.RawMessage(arguments)}})
			require.Error(t, err)
			assert.Zero(t, scales.Load())
			assert.Empty(t, a.activity)
		})
	}
	fixture := lifeFixture("echo", 0)
	a, scales := lifeActivator(t, fixture)
	for _, call := range []struct {
		key  types.NamespacedName
		uid  types.UID
		name string
	}{
		{client.ObjectKeyFromObject(fixture.tool), "old-uid", "echo"},
		{client.ObjectKeyFromObject(fixture.tool), fixture.tool.UID, "unknown"},
		{types.NamespacedName{Namespace: "elsewhere", Name: "echo"}, fixture.tool.UID, "echo"},
	} {
		_, err := a.Invoke(context.Background(), call.key, call.uid, &mcp.CallToolRequest{Params: &mcp.CallToolParamsRaw{Name: call.name}})
		require.Error(t, err)
	}
	t.Setenv(inlinetools.EnabledEnvVar, "false")
	_, err := invoke(a, context.Background(), fixture)
	require.Error(t, err)
	assert.Zero(t, scales.Load())
	assert.Empty(t, a.activity)
}

func TestActivatorWaitsForCurrentEndpointsAndReleasesAbandonedWork(t *testing.T) {
	fixture := lifeFixture("echo", 0)
	fixture.pod.Annotations[inlinetools.SourceHashAnnotation] = "old-revision"
	a, scales := lifeActivator(t, fixture)
	a.activationTimeout = 200 * time.Millisecond
	var requests atomic.Int32
	a.httpClient.Transport = roundTripFunc(func(*http.Request) (*http.Response, error) {
		requests.Add(1)
		return nil, fmt.Errorf("must not connect before readiness")
	})
	_, err := invoke(a, context.Background(), fixture)
	require.ErrorIs(t, err, context.DeadlineExceeded)
	assert.EqualValues(t, 1, scales.Load())
	assert.Zero(t, requests.Load())
	a.mu.Lock()
	state := a.activity[fixture.tool.UID]
	assert.Zero(t, state.calls)
	completed := state.lastCompletion
	a.mu.Unlock()
	require.NoError(t, a.sweep(context.Background(), completed.Add(idleTimeout)))
	assert.Zero(t, storedReplicas(t, a, fixture))

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err = invoke(a, ctx, fixture)
	require.ErrorIs(t, err, context.Canceled)
	assert.Zero(t, requests.Load())
	assert.EqualValues(t, 2, scales.Load(), "cancellation cannot schedule a late scale-up")
}

func TestActivatorHTTPAbandonmentCannotExecuteAfterReadinessArrives(t *testing.T) {
	fixture := lifeFixture("echo", 0)
	fixture.pod.Annotations[inlinetools.SourceHashAnnotation] = "old"
	a, scales := lifeActivator(t, fixture)
	var executions atomic.Int32
	requests := backendServer(t, a, "echo", func(context.Context, *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		executions.Add(1)
		return &mcp.CallToolResult{}, nil
	})
	server := httptest.NewServer(a)
	defer server.Close()
	mcpClient := mcp.NewClient(&mcp.Implementation{Name: "test", Version: "v1"}, nil)
	session, err := mcpClient.Connect(context.Background(), &mcp.StreamableClientTransport{Endpoint: server.URL + "/mcp/tenant/echo/echo-uid"}, nil)
	require.NoError(t, err)
	defer func() { _ = session.Close() }()
	_, err = session.ListTools(context.Background(), nil)
	require.NoError(t, err)
	assert.Zero(t, scales.Load())
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() { _, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "echo"}); done <- err }()
	require.Eventually(t, func() bool { return scales.Load() == 1 }, time.Second, time.Millisecond)
	cancel()
	select {
	case err := <-done:
		require.Error(t, err)
	case <-time.After(time.Second):
		t.Fatal("HTTP caller did not cancel")
	}
	require.Eventually(t, func() bool { a.mu.Lock(); defer a.mu.Unlock(); return a.activity[fixture.tool.UID].calls == 0 }, time.Second, time.Millisecond)
	pod := &corev1.Pod{}
	require.NoError(t, a.client.Get(context.Background(), client.ObjectKeyFromObject(fixture.pod), pod))
	pod.Annotations[inlinetools.SourceHashAnnotation] = runner.SourceHash(fixture.tool.Spec.Inline.Source)
	require.NoError(t, a.client.Update(context.Background(), pod))
	assert.Zero(t, requests.Load(), "the canceled activation has no background work left to connect later")
	assert.Zero(t, executions.Load())
}

func TestActivatorExecutionBudgetIsIndependentAndCancellationReachesBackend(t *testing.T) {
	fixture := lifeFixture("echo", 1)
	a, _ := lifeActivator(t, fixture)
	a.activationTimeout = 500 * time.Millisecond
	a.executionTimeout = 2 * time.Second
	started, canceled := make(chan struct{}), make(chan struct{})
	backendServer(t, a, "echo", func(ctx context.Context, _ *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		close(started)
		<-ctx.Done()
		close(canceled)
		return nil, ctx.Err()
	})
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { _, err := invoke(a, ctx, fixture); done <- err }()
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("backend call did not start")
	}
	select {
	case err := <-done:
		t.Fatalf("handshake context ended invocation: %v", err)
	case <-time.After(600 * time.Millisecond):
	}
	cancel()
	select {
	case err := <-done:
		require.Error(t, err)
	case <-time.After(time.Second):
		t.Fatal("caller cancellation did not return")
	}
	select {
	case <-canceled:
	case <-time.After(time.Second):
		t.Fatal("cancellation did not reach backend")
	}
	a.mu.Lock()
	assert.Zero(t, a.activity[fixture.tool.UID].calls)
	a.mu.Unlock()
}

func TestActivatorRecoversWarmOwnedRunnersConservatively(t *testing.T) {
	fixture, unrelated, nonInline := lifeFixture("echo", 1), lifeFixture("unrelated", 1), lifeFixture("http", 1)
	unrelated.deployment.OwnerReferences = nil
	nonInline.tool.Spec.Type, nonInline.tool.Spec.Inline = arkv1alpha1.ToolTypeHTTP, nil
	a, scales := lifeActivator(t, fixture, unrelated, nonInline)
	require.Len(t, a.activity, 1)
	state := a.activity[fixture.tool.UID]
	require.NoError(t, a.sweep(context.Background(), state.lastCompletion.Add(idleTimeout-time.Nanosecond)))
	assert.Zero(t, scales.Load())
	t.Setenv(inlinetools.EnabledEnvVar, "false")
	require.NoError(t, a.sweep(context.Background(), state.lastCompletion.Add(2*idleTimeout)))
	assert.Zero(t, scales.Load(), "disabled draining belongs to the controller")
	t.Setenv(inlinetools.EnabledEnvVar, "true")
	require.NoError(t, a.sweep(context.Background(), state.lastCompletion.Add(idleTimeout)))
	assert.EqualValues(t, 1, scales.Load())
	assert.Zero(t, storedReplicas(t, a, fixture))
	assert.EqualValues(t, 1, storedReplicas(t, a, unrelated))
	assert.EqualValues(t, 1, storedReplicas(t, a, nonInline))
}

func TestActivatorRunSweepsAndStopsWithItsContext(t *testing.T) {
	fixture := lifeFixture("echo", 1)
	a, scales := lifeActivator(t, fixture)
	a.activity[fixture.tool.UID].lastCompletion = time.Now().Add(-idleTimeout)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- a.Run(ctx) }()
	require.Eventually(t, func() bool { return scales.Load() == 1 }, 3*time.Second, 10*time.Millisecond)
	cancel()
	select {
	case err := <-done:
		require.NoError(t, err)
	case <-time.After(time.Second):
		t.Fatal("idle loop did not stop")
	}
	assert.Zero(t, storedReplicas(t, a, fixture))
}

func TestActivatorRetriesIdleAfterOwnershipLabelsAreRepaired(t *testing.T) {
	fixture := lifeFixture("echo", 1)
	a, scales := lifeActivator(t, fixture)
	deployment := &appsv1.Deployment{}
	require.NoError(t, a.client.Get(context.Background(), client.ObjectKeyFromObject(fixture.deployment), deployment))
	deployment.Labels[inlinetools.LabelToolUID] = "unrelated"
	require.NoError(t, a.client.Update(context.Background(), deployment))
	require.Error(t, a.sweep(context.Background(), time.Now().Add(2*idleTimeout)))
	assert.Zero(t, scales.Load())
	assert.Len(t, a.activity, 1)
	deployment.Labels[inlinetools.LabelToolUID] = string(fixture.tool.UID)
	require.NoError(t, a.client.Update(context.Background(), deployment))
	require.NoError(t, a.sweep(context.Background(), time.Now().Add(2*idleTimeout)))
	assert.EqualValues(t, 1, scales.Load())
	assert.Zero(t, storedReplicas(t, a, fixture))
}

func TestActivatorRecoveryAndIdleWritesFailClosed(t *testing.T) {
	fixture := lifeFixture("echo", 1)
	a, scales := lifeActivator(t, fixture)
	denied := interceptor.NewClient(a.client.(client.WithWatch), interceptor.Funcs{
		List: func(context.Context, client.WithWatch, client.ObjectList, ...client.ListOption) error {
			return fmt.Errorf("read denied")
		},
	})
	_, err := New(context.Background(), denied, "ark-system", []string{"tenant"})
	require.Error(t, err)
	_, err = New(context.Background(), a.client, "", []string{"tenant"})
	require.Error(t, err)
	_, err = New(context.Background(), a.client, "ark-system", nil)
	require.Error(t, err)
	original := a.client
	a.client = interceptor.NewClient(a.client.(client.WithWatch), interceptor.Funcs{
		Get: func(context.Context, client.WithWatch, client.ObjectKey, client.Object, ...client.GetOption) error {
			return fmt.Errorf("read denied")
		},
	})
	require.Error(t, a.sweep(context.Background(), time.Now().Add(2*idleTimeout)))
	assert.Zero(t, scales.Load())
	assert.Len(t, a.activity, 1, "a failed idle transition must remain retryable")
	a.client = original
	tool := &arkv1alpha1.Tool{}
	require.NoError(t, a.client.Get(context.Background(), client.ObjectKeyFromObject(fixture.tool), tool))
	require.NoError(t, a.client.Delete(context.Background(), tool))
	tool.ResourceVersion, tool.UID = "", "replacement-uid"
	require.NoError(t, a.client.Create(context.Background(), tool))
	require.NoError(t, a.sweep(context.Background(), time.Now().Add(2*idleTimeout)))
	assert.Zero(t, scales.Load(), "old activity must not scale a recreated Tool")
	assert.Empty(t, a.activity)
}

func TestActivatorPreservesToolErrorsAndNeverRetriesUncertainResponses(t *testing.T) {
	for _, uncertain := range []bool{false, true} {
		t.Run(fmt.Sprint(uncertain), func(t *testing.T) {
			fixture := lifeFixture("echo", 1)
			a, _ := lifeActivator(t, fixture)
			var calls atomic.Int32
			backendServer(t, a, "echo", func(context.Context, *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
				calls.Add(1)
				return &mcp.CallToolResult{IsError: true, Content: []mcp.Content{&mcp.TextContent{Text: "script failed"}}}, nil
			})
			if uncertain {
				transport := a.httpClient.Transport
				a.httpClient.Transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
					response, err := transport.RoundTrip(r)
					if err == nil && calls.Load() > 0 {
						_ = response.Body.Close()
						return nil, fmt.Errorf("response lost after execution")
					}
					return response, err
				})
			}
			result, err := invoke(a, context.Background(), fixture)
			if uncertain {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
				assert.True(t, result.IsError)
			}
			assert.EqualValues(t, 1, calls.Load())
		})
	}
}

func TestActivatorCancellationDoesNotAbandonAnotherPendingCaller(t *testing.T) {
	fixture := lifeFixture("echo", 0)
	fixture.pod.Annotations[inlinetools.SourceHashAnnotation] = "old"
	a, scales := lifeActivator(t, fixture)
	var executions atomic.Int32
	backendServer(t, a, "echo", func(context.Context, *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		executions.Add(1)
		return &mcp.CallToolResult{}, nil
	})
	ctx, cancel := context.WithCancel(context.Background())
	first, second := make(chan error, 1), make(chan error, 1)
	go func() { _, err := invoke(a, ctx, fixture); first <- err }()
	require.Eventually(t, func() bool { return scales.Load() == 1 }, time.Second, time.Millisecond)
	go func() { _, err := invoke(a, context.Background(), fixture); second <- err }()
	require.Eventually(t, func() bool {
		a.mu.Lock()
		defer a.mu.Unlock()
		return a.activity[fixture.tool.UID].calls == 2
	}, time.Second, time.Millisecond)
	require.NoError(t, a.sweep(context.Background(), time.Now().Add(2*idleTimeout)))
	assert.EqualValues(t, 1, scales.Load(), "pending callers prevent idle scale-down")
	cancel()
	select {
	case err := <-first:
		require.ErrorIs(t, err, context.Canceled)
	case <-time.After(time.Second):
		t.Fatal("pending call did not cancel")
	}
	pod := &corev1.Pod{}
	require.NoError(t, a.client.Get(context.Background(), client.ObjectKeyFromObject(fixture.pod), pod))
	pod.Annotations[inlinetools.SourceHashAnnotation] = runner.SourceHash(fixture.tool.Spec.Inline.Source)
	require.NoError(t, a.client.Update(context.Background(), pod))
	select {
	case err := <-second:
		require.NoError(t, err)
	case <-time.After(time.Second):
		t.Fatal("remaining caller did not finish")
	}
	assert.EqualValues(t, 1, executions.Load(), "the abandoned call must never execute later")
	assert.EqualValues(t, 1, scales.Load())
}

func TestActivatorIdleWriteAndNewCallAreSerialized(t *testing.T) {
	fixture := lifeFixture("echo", 1)
	a, _ := lifeActivator(t, fixture)
	var executions atomic.Int32
	backendServer(t, a, "echo", func(context.Context, *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		executions.Add(1)
		return &mcp.CallToolResult{}, nil
	})
	writing, release := make(chan struct{}), make(chan struct{})
	a.client = interceptor.NewClient(a.client.(client.WithWatch), interceptor.Funcs{
		SubResourceUpdate: func(ctx context.Context, c client.Client, name string, object client.Object, opts ...client.SubResourceUpdateOption) error {
			options := &client.SubResourceUpdateOptions{}
			for _, option := range opts {
				option.ApplyToSubResourceUpdate(options)
			}
			if options.SubResourceBody.(*autoscalingv1.Scale).Spec.Replicas == 0 {
				close(writing)
				<-release
			}
			return c.SubResource(name).Update(ctx, object, opts...)
		},
	})
	swept := make(chan error, 1)
	go func() { swept <- a.sweep(context.Background(), time.Now().Add(2*idleTimeout)) }()
	select {
	case <-writing:
	case <-time.After(time.Second):
		t.Fatal("idle write did not start")
	}
	called := make(chan error, 1)
	go func() { _, err := invoke(a, context.Background(), fixture); called <- err }()
	require.Eventually(t, func() bool { a.mu.Lock(); defer a.mu.Unlock(); return a.activity[fixture.tool.UID].calls == 1 }, time.Second, time.Millisecond)
	assert.Zero(t, executions.Load())
	close(release)
	require.NoError(t, <-swept)
	select {
	case err := <-called:
		require.NoError(t, err)
	case <-time.After(time.Second):
		t.Fatal("new call did not follow idle write")
	}
	assert.EqualValues(t, 1, storedReplicas(t, a, fixture))
	assert.EqualValues(t, 1, executions.Load())
}

func TestActivatorBoundsExecutionAndHonorsCallerDeadline(t *testing.T) {
	for _, callerBudget := range []bool{false, true} {
		t.Run(fmt.Sprint(callerBudget), func(t *testing.T) {
			fixture := lifeFixture("echo", 1)
			a, _ := lifeActivator(t, fixture)
			assert.Equal(t, 60*time.Second, a.activationTimeout)
			assert.Equal(t, 30*time.Second, a.executionTimeout)
			a.executionTimeout = 30 * time.Millisecond
			backendServer(t, a, "echo", func(ctx context.Context, _ *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
				<-ctx.Done()
				return nil, ctx.Err()
			})
			ctx, cancel := context.WithTimeout(context.Background(), time.Second)
			defer cancel()
			if callerBudget {
				a.executionTimeout = time.Second
				ctx, cancel = context.WithTimeout(ctx, 30*time.Millisecond)
				defer cancel()
			}
			_, err := invoke(a, ctx, fixture)
			require.Error(t, err)
			a.mu.Lock()
			assert.Zero(t, a.activity[fixture.tool.UID].calls)
			a.mu.Unlock()
		})
	}
}

func TestActivatorDoesNotFollowBackendRedirects(t *testing.T) {
	fixture := lifeFixture("echo", 1)
	a, _ := lifeActivator(t, fixture)
	var executions, leaked atomic.Int32
	trap := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { leaked.Add(1); w.WriteHeader(http.StatusOK) }))
	defer trap.Close()
	backendServer(t, a, "echo", func(context.Context, *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		executions.Add(1)
		return &mcp.CallToolResult{}, nil
	})
	transport := a.httpClient.Transport
	a.httpClient.Transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		response, err := transport.RoundTrip(r)
		if err == nil && executions.Load() > 0 {
			response.StatusCode = http.StatusTemporaryRedirect
			response.Header.Set("Location", trap.URL)
		}
		return response, err
	})
	_, err := invoke(a, context.Background(), fixture)
	require.Error(t, err)
	assert.EqualValues(t, 1, executions.Load())
	assert.Zero(t, leaked.Load())
}

func TestActivatorFailsClosedOnReadErrorsAndSourceChangesDuringHandshake(t *testing.T) {
	for _, sourceChange := range []bool{false, true} {
		t.Run(fmt.Sprint(sourceChange), func(t *testing.T) {
			fixture := lifeFixture("echo", 1)
			a, _ := lifeActivator(t, fixture)
			var executions atomic.Int32
			backendServer(t, a, "echo", func(context.Context, *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
				executions.Add(1)
				return &mcp.CallToolResult{}, nil
			})
			if sourceChange {
				transport := a.httpClient.Transport
				var changed atomic.Bool
				a.httpClient.Transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
					response, err := transport.RoundTrip(r)
					if changed.CompareAndSwap(false, true) {
						tool := &arkv1alpha1.Tool{}
						if getErr := a.client.Get(r.Context(), client.ObjectKeyFromObject(fixture.tool), tool); getErr != nil {
							return nil, getErr
						}
						tool.Spec.Inline.Source = "changed"
						tool.Generation++
						if updateErr := a.client.Update(r.Context(), tool); updateErr != nil {
							return nil, updateErr
						}
					}
					return response, err
				})
			} else {
				a.client = interceptor.NewClient(a.client.(client.WithWatch), interceptor.Funcs{List: func(context.Context, client.WithWatch, client.ObjectList, ...client.ListOption) error {
					return fmt.Errorf("API read denied")
				}})
			}
			_, err := invoke(a, context.Background(), fixture)
			require.Error(t, err)
			assert.Zero(t, executions.Load())
		})
	}
}

func TestActivatorRejectsServicesPublishingUnreadyPods(t *testing.T) {
	fixture := lifeFixture("echo", 0)
	fixture.service.Spec.PublishNotReadyAddresses = true
	a, scales := lifeActivator(t, fixture)
	_, err := invoke(a, context.Background(), fixture)
	require.Error(t, err)
	assert.Zero(t, scales.Load())
}

func TestActivatorRejectsStaleOrUnownedEndpoints(t *testing.T) {
	changes := map[string]func(*runnerFixture){
		"deployment not observed": func(f *runnerFixture) { f.deployment.Status.ObservedGeneration = 0 },
		"old replicas":            func(f *runnerFixture) { f.deployment.Status.Replicas = 2 },
		"missing endpoints":       func(f *runnerFixture) { f.endpoints.Endpoints = nil },
		"mixed unknown readiness": func(f *runnerFixture) {
			f.endpoints.Endpoints = append(f.endpoints.Endpoints, discoveryv1.Endpoint{Addresses: []string{"192.0.2.1"}})
		},
		"mixed terminating readiness": func(f *runnerFixture) {
			f.endpoints.Endpoints = append(f.endpoints.Endpoints, discoveryv1.Endpoint{Conditions: discoveryv1.EndpointConditions{Ready: ptr.To(true), Terminating: ptr.To(true)}})
		},
		"wrong service owner":      func(f *runnerFixture) { f.endpoints.OwnerReferences[0].UID = "other" },
		"wrong port":               func(f *runnerFixture) { f.endpoints.Ports[0].Port = ptr.To(int32(80)) },
		"endpoint unready":         func(f *runnerFixture) { f.endpoints.Endpoints[0].Conditions.Ready = ptr.To(false) },
		"terminating endpoint":     func(f *runnerFixture) { f.endpoints.Endpoints[0].Conditions.Terminating = ptr.To(true) },
		"unreferenced endpoint":    func(f *runnerFixture) { f.endpoints.Endpoints[0].TargetRef = nil },
		"cross-namespace endpoint": func(f *runnerFixture) { f.endpoints.Endpoints[0].TargetRef.Namespace = "elsewhere" },
		"foreign address":          func(f *runnerFixture) { f.endpoints.Endpoints[0].Addresses = []string{"192.0.2.1"} },
		"stale pod UID":            func(f *runnerFixture) { f.endpoints.Endpoints[0].TargetRef.UID = "old" },
		"old source":               func(f *runnerFixture) { f.pod.Annotations[inlinetools.SourceHashAnnotation] = "old" },
		"old language":             func(f *runnerFixture) { f.pod.Spec.Containers[0].Env[1].Value = "bash" },
		"unready pod":              func(f *runnerFixture) { f.pod.Status.Conditions = nil },
		"foreign pod labels":       func(f *runnerFixture) { f.pod.Labels[inlinetools.LabelToolUID] = "other" },
		"unowned pod":              func(f *runnerFixture) { f.pod.OwnerReferences = nil },
		"foreign RS":               func(f *runnerFixture) { f.rs.OwnerReferences[0].UID = "other" },
	}
	for name, change := range changes {
		t.Run(name, func(t *testing.T) {
			fixture := lifeFixture("echo", 1)
			change(fixture)
			a, _ := lifeActivator(t, fixture)
			target, err := a.resolve(context.Background(), client.ObjectKeyFromObject(fixture.tool), fixture.tool.UID, "echo")
			require.NoError(t, err)
			ready, err := a.ready(context.Background(), target)
			require.NoError(t, err)
			assert.False(t, ready)
		})
	}
}
