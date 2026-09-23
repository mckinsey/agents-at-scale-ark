/* Copyright 2025. McKinsey & Company */

package activator

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/util/validation"
	"k8s.io/utils/ptr"
	"sigs.k8s.io/controller-runtime/pkg/client"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/inlinetools"
	"mckinsey.com/ark/internal/inlinetools/runner"
	"mckinsey.com/ark/internal/inlinetools/transport"
)

// InvokeFunc is called only by tools/call, never by discovery or session setup.
// Its implementation must authorize, validate, activate and track the call.
// Passing only the route identity keeps callers from choosing a backend URL.
type InvokeFunc func(context.Context, types.NamespacedName, types.UID, *mcp.CallToolRequest) (*mcp.CallToolResult, error)

// Handler serves metadata through the existing stateless MCP transport. It has
// only a Reader: all runner lifecycle operations belong to the invocation path.
func Handler(reader client.Reader, namespaces []string, invoke InvokeFunc) (http.Handler, error) {
	if reader == nil || invoke == nil {
		return nil, fmt.Errorf("metadata reader and invocation handler are required")
	}
	if len(namespaces) == 0 {
		return nil, fmt.Errorf("at least one watched namespace is required")
	}
	allowed := make(map[string]bool, len(namespaces))
	for _, namespace := range namespaces {
		if len(validation.IsDNS1123Label(namespace)) != 0 {
			return nil, fmt.Errorf("invalid watched namespace %q", namespace)
		}
		allowed[namespace] = true
	}
	mux := http.NewServeMux()
	mux.HandleFunc(inlinetools.ActivatorRoutePrefix+"/{namespace}/{name}/{uid}", func(w http.ResponseWriter, r *http.Request) {
		key := types.NamespacedName{Namespace: r.PathValue("namespace"), Name: r.PathValue("name")}
		if !allowed[key.Namespace] || len(validation.IsDNS1123Subdomain(key.Name)) != 0 {
			http.NotFound(w, r)
			return
		}
		tool := &arkv1alpha1.Tool{}
		if err := reader.Get(r.Context(), key, tool); err != nil {
			if apierrors.IsNotFound(err) {
				http.NotFound(w, r)
			} else {
				http.Error(w, "Tool metadata unavailable", http.StatusServiceUnavailable)
			}
			return
		}
		if tool.Spec.Type != arkv1alpha1.ToolTypeInline || tool.Spec.Inline == nil || tool.UID == "" ||
			string(tool.UID) != r.PathValue("uid") || !tool.DeletionTimestamp.IsZero() {
			http.NotFound(w, r)
			return
		}
		descriptor, err := metadata(tool)
		if err != nil {
			http.Error(w, "Tool metadata invalid", http.StatusServiceUnavailable)
			return
		}
		server := mcp.NewServer(&mcp.Implementation{Name: inlinetools.ActivatorName, Version: "v1"}, nil)
		server.AddTool(descriptor, func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			return invoke(ctx, key, tool.UID, req)
		})
		r.Body = http.MaxBytesReader(w, r.Body, runner.MaxRequestBytes)
		transport.Handler(server).ServeHTTP(w, r)
	})
	return mux, nil
}

func metadata(tool *arkv1alpha1.Tool) (*mcp.Tool, error) {
	schema := json.RawMessage(`{"type":"object"}`)
	if tool.Spec.InputSchema != nil {
		schema = tool.Spec.InputSchema.Raw
	}
	// Server.AddTool panics on a non-object schema. Fail closed instead if stored
	// metadata is invalid; discovery does not resolve or fetch schema references.
	var object map[string]any
	if err := json.Unmarshal(schema, &object); err != nil || object["type"] != "object" {
		return nil, fmt.Errorf("inline input schema must describe an object")
	}
	descriptor := &mcp.Tool{Name: tool.Name, Description: tool.Spec.Description, InputSchema: schema}
	if annotations := tool.Spec.Annotations; annotations != nil {
		descriptor.Annotations = &mcp.ToolAnnotations{
			Title: annotations.Title, ReadOnlyHint: annotations.ReadOnlyHint, IdempotentHint: annotations.IdempotentHint,
			DestructiveHint: ptr.To(annotations.DestructiveHint), OpenWorldHint: ptr.To(annotations.OpenWorldHint),
		}
	}
	return descriptor, nil
}
