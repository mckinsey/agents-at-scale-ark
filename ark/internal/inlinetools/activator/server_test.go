/* Copyright 2025. McKinsey & Company */

package activator

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/inlinetools/runner"
)

const testRoute = "/mcp/tenant/echo/tool-uid"

func discoveryTool() *arkv1alpha1.Tool {
	return &arkv1alpha1.Tool{
		ObjectMeta: metav1.ObjectMeta{Name: "echo", Namespace: "tenant", UID: "tool-uid"},
		Spec: arkv1alpha1.ToolSpec{
			Type: arkv1alpha1.ToolTypeInline, Description: "Echo the arguments",
			Inline: &arkv1alpha1.InlineSpec{Language: "python", Source: "SECRET_SOURCE_SENTINEL"},
		},
	}
}

type metadataReader struct {
	client.Reader
	reads atomic.Int32
	fail  error
}

func (r *metadataReader) Get(ctx context.Context, key client.ObjectKey, object client.Object, opts ...client.GetOption) error {
	r.reads.Add(1)
	if _, ok := object.(*arkv1alpha1.Tool); !ok {
		return fmt.Errorf("discovery may read only Tool metadata, got %T", object)
	}
	if r.fail != nil {
		return r.fail
	}
	return r.Reader.Get(ctx, key, object, opts...)
}

func (*metadataReader) List(context.Context, client.ObjectList, ...client.ListOption) error {
	return fmt.Errorf("discovery must not list resources")
}

func discoveryClient(t *testing.T, objects ...client.Object) client.Client {
	t.Helper()
	scheme := runtime.NewScheme()
	require.NoError(t, arkv1alpha1.AddToScheme(scheme))
	return fake.NewClientBuilder().WithScheme(scheme).WithObjects(objects...).Build()
}

func rpc(t *testing.T, handler http.Handler, route, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, route, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)
	return recorder
}

func TestDiscoveryDoesNotInvokeOrMaintainRunnerState(t *testing.T) {
	tool := discoveryTool()
	reader := &metadataReader{Reader: discoveryClient(t, tool)}
	var calls atomic.Int32
	handler, err := Handler(reader, []string{"tenant"}, func(context.Context, types.NamespacedName, types.UID, *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		calls.Add(1)
		return &mcp.CallToolResult{}, nil
	})
	require.NoError(t, err)
	server := httptest.NewServer(handler)
	defer server.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	mcpClient := mcp.NewClient(&mcp.Implementation{Name: "test", Version: "v1"}, nil)
	session, err := mcpClient.Connect(ctx, &mcp.StreamableClientTransport{Endpoint: server.URL + testRoute}, nil)
	require.NoError(t, err)
	defer func() { _ = session.Close() }()
	require.NoError(t, session.Ping(ctx, nil))
	for range 3 {
		listing, err := session.ListTools(ctx, nil)
		require.NoError(t, err)
		require.Len(t, listing.Tools, 1)
		assert.Equal(t, tool.Name, listing.Tools[0].Name)
		assert.Equal(t, tool.Spec.Description, listing.Tools[0].Description)
		schema, err := json.Marshal(listing.Tools[0].InputSchema)
		require.NoError(t, err)
		assert.JSONEq(t, `{"type":"object"}`, string(schema))
		body, err := json.Marshal(listing)
		require.NoError(t, err)
		assert.NotContains(t, string(body), tool.Spec.Inline.Source)
		assert.NotContains(t, string(body), "inline")
	}
	assert.Zero(t, calls.Load(), "only invocation can start a runner or refresh its idle clock")
	assert.Positive(t, reader.reads.Load())
}

func TestDiscoveryIsStatelessAndReadsCurrentMetadata(t *testing.T) {
	tool := discoveryTool()
	kube := discoveryClient(t, tool)
	var calls atomic.Int32
	handler, err := Handler(kube, []string{"tenant"}, func(context.Context, types.NamespacedName, types.UID, *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		calls.Add(1)
		return &mcp.CallToolResult{}, nil
	})
	require.NoError(t, err)
	request := `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`
	first := rpc(t, handler, testRoute, request)
	assert.Equal(t, http.StatusOK, first.Code, first.Body.String())
	assert.Empty(t, first.Header().Get("Mcp-Session-Id"))
	assert.Contains(t, first.Body.String(), "Echo the arguments")
	require.NoError(t, kube.Get(context.Background(), client.ObjectKeyFromObject(tool), tool))
	tool.Spec.Description = "Updated metadata"
	tool.Spec.InputSchema = &runtime.RawExtension{Raw: []byte(`{"type":"object","properties":{"text":{"type":"string"}},"required":["text"]}`)}
	tool.Spec.Annotations = &arkv1alpha1.ToolAnnotations{Title: "Echo", ReadOnlyHint: true, IdempotentHint: true}
	require.NoError(t, kube.Update(context.Background(), tool))
	second := rpc(t, handler, testRoute, request)
	assert.Equal(t, http.StatusOK, second.Code, second.Body.String())
	assert.Contains(t, second.Body.String(), "Updated metadata")
	assert.NotContains(t, second.Body.String(), "Echo the arguments")
	assert.Contains(t, second.Body.String(), `"required":["text"]`)
	assert.Contains(t, second.Body.String(), `"readOnlyHint":true`)
	assert.Contains(t, second.Body.String(), `"destructiveHint":false`)
	assert.NotContains(t, second.Body.String(), tool.Spec.Inline.Source)
	assert.Zero(t, calls.Load())

	notification := rpc(t, handler, testRoute, `{"jsonrpc":"2.0","method":"notifications/initialized"}`)
	assert.Equal(t, http.StatusAccepted, notification.Code)
	ping := rpc(t, handler, testRoute, `{"jsonrpc":"2.0","id":2,"method":"ping"}`)
	assert.Equal(t, http.StatusOK, ping.Code)
	assert.Zero(t, calls.Load())
}

func TestOnlyKnownToolCallReachesInvocationWithRouteIdentity(t *testing.T) {
	var calls atomic.Int32
	handler, err := Handler(discoveryClient(t, discoveryTool()), []string{"tenant"}, func(_ context.Context, key types.NamespacedName, uid types.UID, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		calls.Add(1)
		assert.Equal(t, types.NamespacedName{Namespace: "tenant", Name: "echo"}, key)
		assert.Equal(t, types.UID("tool-uid"), uid)
		assert.Equal(t, "echo", req.Params.Name)
		assert.JSONEq(t, `{"value":9007199254740993}`, string(req.Params.Arguments))
		return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: "invoked"}}}, nil
	})
	require.NoError(t, err)
	unknown := rpc(t, handler, testRoute, `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"other","arguments":{}}}`)
	assert.Contains(t, unknown.Body.String(), `"error"`)
	assert.Zero(t, calls.Load())
	known := rpc(t, handler, testRoute+"?target=http://attacker", `{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"echo","arguments":{"value":9007199254740993}}}`)
	assert.Contains(t, known.Body.String(), "invoked")
	assert.EqualValues(t, 1, calls.Load(), "the target query parameter is never passed to invocation")
}

func TestDiscoveryRejectsRoutesOutsideCurrentWatchedIdentity(t *testing.T) {
	for _, route := range []string{"/mcp/elsewhere/echo/tool-uid", "/mcp/tenant/unknown/tool-uid", "/mcp/tenant/echo/old-uid", "/mcp/tenant/BadName/tool-uid", "/mcp/tenant/echo", "/mcp/tenant/echo/tool-uid/extra"} {
		t.Run(route, func(t *testing.T) {
			var calls atomic.Int32
			reader := &metadataReader{Reader: discoveryClient(t, discoveryTool())}
			handler, err := Handler(reader, []string{"tenant"}, func(context.Context, types.NamespacedName, types.UID, *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
				calls.Add(1)
				return nil, fmt.Errorf("must not invoke")
			})
			require.NoError(t, err)
			response := rpc(t, handler, route, `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`)
			assert.Equal(t, http.StatusNotFound, response.Code)
			assert.Zero(t, calls.Load())
			if strings.Contains(route, "elsewhere") || strings.Contains(route, "BadName") {
				assert.Zero(t, reader.reads.Load(), "reject invalid scope before using the activator's API identity")
			}
		})
	}
}

func TestDiscoveryFailsClosedOnInvalidMetadataOrReads(t *testing.T) {
	for _, change := range []func(*arkv1alpha1.Tool){
		func(t *arkv1alpha1.Tool) { t.Spec.Type = arkv1alpha1.ToolTypeHTTP },
		func(t *arkv1alpha1.Tool) { t.Spec.Inline = nil },
		func(t *arkv1alpha1.Tool) { t.UID = "" },
		func(t *arkv1alpha1.Tool) {
			t.DeletionTimestamp = &metav1.Time{Time: metav1.Now().Time}
			t.Finalizers = []string{"hold"}
		},
		func(t *arkv1alpha1.Tool) { t.Spec.InputSchema = &runtime.RawExtension{Raw: []byte(`{"type":"array"}`)} },
	} {
		tool := discoveryTool()
		change(tool)
		handler, err := Handler(discoveryClient(t, tool), []string{"tenant"}, func(context.Context, types.NamespacedName, types.UID, *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			t.Error("invalid metadata must not invoke")
			return nil, fmt.Errorf("must not invoke")
		})
		require.NoError(t, err)
		response := rpc(t, handler, testRoute, `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`)
		assert.NotEqual(t, http.StatusOK, response.Code)
		assert.NotContains(t, response.Body.String(), "SECRET_SOURCE_SENTINEL")
	}
	reader := &metadataReader{fail: fmt.Errorf("SECRET_SOURCE_SENTINEL")}
	handler, err := Handler(reader, []string{"tenant"}, func(context.Context, types.NamespacedName, types.UID, *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		return nil, nil
	})
	require.NoError(t, err)
	response := rpc(t, handler, testRoute, `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`)
	assert.Equal(t, http.StatusServiceUnavailable, response.Code)
	assert.NotContains(t, response.Body.String(), "SECRET_SOURCE_SENTINEL")
}

func TestDiscoveryRequiresExplicitNamespaceScopeAndInvocationHandler(t *testing.T) {
	invoke := func(context.Context, types.NamespacedName, types.UID, *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		return nil, nil
	}
	reader := discoveryClient(t)
	for _, namespaces := range [][]string{nil, {}, {""}, {"*"}, {"tenant", ""}, {"tenant other"}} {
		_, err := Handler(reader, namespaces, invoke)
		require.Error(t, err)
	}
	_, err := Handler(nil, []string{"tenant"}, invoke)
	require.Error(t, err)
	_, err = Handler(reader, []string{"tenant"}, nil)
	require.Error(t, err)
}

func TestDiscoveryBoundsRequestBodyBeforeDecoding(t *testing.T) {
	var calls atomic.Int32
	handler, err := Handler(discoveryClient(t, discoveryTool()), []string{"tenant"}, func(context.Context, types.NamespacedName, types.UID, *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		calls.Add(1)
		return nil, nil
	})
	require.NoError(t, err)
	response := rpc(t, handler, testRoute, `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"echo","arguments":{"text":"`+strings.Repeat("x", runner.MaxRequestBytes)+`"}}}`)
	assert.NotEqual(t, http.StatusOK, response.Code)
	assert.Zero(t, calls.Load())
}
