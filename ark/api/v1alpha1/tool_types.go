/* Copyright 2025. McKinsey & Company */

package v1alpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
)

// MCPServerRef references an MCP server that provides this tool
type MCPServerRef struct {
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:MinLength=1
	Name string `json:"name"`
	// +kubebuilder:validation:Optional
	Namespace string `json:"namespace,omitempty"`
}

// MCPToolRef references a specific tool on an MCP server
type MCPToolRef struct {
	// +kubebuilder:validation:Required
	MCPServerRef MCPServerRef `json:"mcpServerRef"`
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:MinLength=1
	ToolName string `json:"toolName"`
}

// AgentToolRef defines a reference to an Agent Tool.
type AgentToolRef struct {
	// Name of the Agent being referenced.
	// This must be a non-empty string.
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:MinLength=1
	Name string `json:"name"`
}

// TeamToolRef defines a reference to a Team Tool.
type TeamToolRef struct {
	// Name of the Team being referenced.
	// This must be a non-empty string.
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:MinLength=1
	Name string `json:"name"`
}

// BuiltinToolRef defines a reference to a Builtin Tool.
type BuiltinToolRef struct {
	// Name of the Builtin being referenced.
	// This must be a non-empty string.
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:MinLength=1
	Name string `json:"name"`
}

// ToolAnnotations contains optional additional tool information
type ToolAnnotations struct {
	// If true, the tool may perform destructive updates to its environment. If
	// false, the tool performs only additive updates.
	//
	// (This property is meaningful only when `readOnlyHint == false`)
	//
	// Default: true
	DestructiveHint bool `json:"destructiveHint,omitempty"`
	// If true, calling the tool repeatedly with the same arguments will have no
	// additional effect on the its environment.
	//
	// (This property is meaningful only when `readOnlyHint == false`)
	//
	// Default: false
	IdempotentHint bool `json:"idempotentHint,omitempty"`
	// If true, this tool may interact with an "open world" of external entities. If
	// false, the tool's domain of interaction is closed.
	//
	// Default: true
	OpenWorldHint bool `json:"openWorldHint,omitempty"`
	// If true, the tool does not modify its environment.
	//
	// Default: false
	ReadOnlyHint bool `json:"readOnlyHint,omitempty"`
	// A human-readable title for the tool.
	Title string `json:"title,omitempty"`
}

type ToolSpec struct {
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:Enum=http;mcp;agent;team;builtin
	Type string `json:"type"`
	// Tool description
	Description string `json:"description,omitempty"`
	// Input schema for the tool
	InputSchema *runtime.RawExtension `json:"inputSchema,omitempty"`
	// Optional additional tool information
	Annotations *ToolAnnotations `json:"annotations,omitempty"`
	// HTTP-specific configuration for HTTP-based tools
	HTTP *HTTPSpec `json:"http,omitempty"`
	// MCP-specific configuration for MCP server tools
	// +kubebuilder:validation:Optional
	MCP *MCPToolRef `json:"mcp,omitempty"`
	// Agent-specific configuration for agent tools.
	// This field is required only if Type = "agent".
	// +kubebuilder:validation:Optional
	Agent *AgentToolRef `json:"agent,omitempty"`
	// Team-specific configuration for team tools.
	// This field is required only if Type = "team".
	// +kubebuilder:validation:Optional
	Team *TeamToolRef `json:"team,omitempty"`
	// Builtin-specific configuration for builtin tools.
	// This field is required only if Type = "builtin".
	// +kubebuilder:validation:Optional
	Builtin *BuiltinToolRef `json:"builtin,omitempty"`
}

type HTTPSpec struct {
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:MinLength=1
	// +kubebuilder:validation:Pattern="^https?://.*"
	URL string `json:"url"`
	// +kubebuilder:validation:Enum=GET;POST;PUT;DELETE;PATCH
	// +kubebuilder:default="GET"
	Method  string   `json:"method,omitempty"`
	Headers []Header `json:"headers,omitempty"`
	// +kubebuilder:validation:Pattern=^[0-9]+[smh]?$
	Timeout string `json:"timeout,omitempty"`
	// Body template for POST/PUT/PATCH requests with golang template syntax
	Body string `json:"body,omitempty"`
	// +kubebuilder:validation:Optional
	// Parameters for body template processing
	BodyParameters []Parameter `json:"bodyParameters,omitempty"`
}

// Tool type constants
const (
	ToolTypeHTTP    = "http"
	ToolTypeMCP     = "mcp"
	ToolTypeAgent   = "agent"
	ToolTypeTeam    = "team"
	ToolTypeBuiltin = "builtin"
)

// Tool state constants
const (
	ToolStateReady = "Ready"
)

type ToolStatus struct {
	State   string `json:"state,omitempty"`
	Message string `json:"message,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
type Tool struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   ToolSpec   `json:"spec,omitempty"`
	Status ToolStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true
type ToolList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata"`
	Items           []Tool `json:"items"`
}

func init() {
	SchemeBuilder.Register(&Tool{}, &ToolList{})
}

func (in *ToolSpec) DeepCopyInto(out *ToolSpec) {
	*out = *in
	if in.InputSchema != nil {
		in, out := &in.InputSchema, &out.InputSchema
		*out = new(runtime.RawExtension)
		(*in).DeepCopyInto(*out)
	}
	if in.Annotations != nil {
		in, out := &in.Annotations, &out.Annotations
		*out = new(ToolAnnotations)
		(*in).DeepCopyInto(*out)
	}
	if in.HTTP != nil {
		in, out := &in.HTTP, &out.HTTP
		*out = new(HTTPSpec)
		(*in).DeepCopyInto(*out)
	}
	if in.MCP != nil {
		in, out := &in.MCP, &out.MCP
		*out = new(MCPToolRef)
		(*in).DeepCopyInto(*out)
	}
	if in.Agent != nil {
		in, out := &in.Agent, &out.Agent
		*out = new(AgentToolRef)
		(*in).DeepCopyInto(*out)
	}
	if in.Team != nil {
		in, out := &in.Team, &out.Team
		*out = new(TeamToolRef)
		(*in).DeepCopyInto(*out)
	}
	if in.Builtin != nil {
		in, out := &in.Builtin, &out.Builtin
		*out = new(BuiltinToolRef)
		(*in).DeepCopyInto(*out)
	}
}

func (in *MCPServerRef) DeepCopyInto(out *MCPServerRef) {
	*out = *in
}

func (in *ToolAnnotations) DeepCopyInto(out *ToolAnnotations) {
	*out = *in
}

func (in *MCPToolRef) DeepCopyInto(out *MCPToolRef) {
	*out = *in
}

func (in *TeamToolRef) DeepCopyInto(out *TeamToolRef) {
	*out = *in
}

func (in *HTTPSpec) DeepCopyInto(out *HTTPSpec) {
	*out = *in
	if in.Headers != nil {
		in, out := &in.Headers, &out.Headers
		*out = make([]Header, len(*in))
		copy(*out, *in)
	}
	if in.BodyParameters != nil {
		in, out := &in.BodyParameters, &out.BodyParameters
		*out = make([]Parameter, len(*in))
		for i := range *in {
			(*in)[i].DeepCopyInto(&(*out)[i])
		}
	}
}
