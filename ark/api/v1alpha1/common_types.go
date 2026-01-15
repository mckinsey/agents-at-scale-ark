/* Copyright 2025. McKinsey & Company */

package v1alpha1

import (
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// ValueSource represents a source for a configuration value
type ValueSource struct {
	// +kubebuilder:validation:Optional
	Value string `json:"value,omitempty"`
	// +kubebuilder:validation:Optional
	ValueFrom *ValueFromSource `json:"valueFrom,omitempty"`
}

type ValueFromSource struct {
	// +kubebuilder:validation:Optional
	SecretKeyRef *corev1.SecretKeySelector `json:"secretKeyRef,omitempty"`
	// +kubebuilder:validation:Optional
	ConfigMapKeyRef *corev1.ConfigMapKeySelector `json:"configMapKeyRef,omitempty"`
	// +kubebuilder:validation:Optional
	ServiceRef *ServiceReference `json:"serviceRef,omitempty"`
	// +kubebuilder:validation:Optional
	QueryParameterRef *QueryParameterReference `json:"queryParameterRef,omitempty"`
}

type QueryParameterReference struct {
	// Name of the parameter from the Query resource
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:MinLength=1
	Name string `json:"name"`
}

type ServiceReference struct {
	// Name of the service
	Name string `json:"name"`
	// +kubebuilder:validation:Optional
	// Namespace of the service. Defaults to the namespace as the resource.
	Namespace string `json:"namespace,omitempty"`
	// +kubebuilder:validation:Optional
	// Port name to use. If not specified, uses the service's only port or first port.
	Port string `json:"port,omitempty"`
	// +kubebuilder:validation:Optional
	// Path component of the service URL. For anthropic models might be 'v1', for gemini might be 'v1beta/openai', for MCP servers often will be 'mcp' or 'sse'.
	Path string `json:"path,omitempty"`
}

type Parameter struct {
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:MinLength=1
	// Name of the parameter (used as template variable)
	Name string `json:"name"`
	// +kubebuilder:validation:Optional
	// Direct value (mutually exclusive with valueFrom)
	Value string `json:"value,omitempty"`
	// +kubebuilder:validation:Optional
	// Reference to external sources (mutually exclusive with value)
	ValueFrom *ValueFromSource `json:"valueFrom,omitempty"`
}

type HeaderValue struct {
	// +kubebuilder:validation:Optional
	Value string `json:"value,omitempty"`
	// +kubebuilder:validation:Optional
	ValueFrom *HeaderValueSource `json:"valueFrom,omitempty"`
}

type HeaderValueSource struct {
	// +kubebuilder:validation:Optional
	SecretKeyRef *corev1.SecretKeySelector `json:"secretKeyRef,omitempty"`
	// +kubebuilder:validation:Optional
	ConfigMapKeyRef *corev1.ConfigMapKeySelector `json:"configMapKeyRef,omitempty"`
	// +kubebuilder:validation:Optional
	QueryParameterRef *QueryParameterReference `json:"queryParameterRef,omitempty"`
}

type Header struct {
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:MinLength=1
	Name string `json:"name"`
	// +kubebuilder:validation:Required
	Value HeaderValue `json:"value"`
}

type Override struct {
	// +kubebuilder:validation:Required
	Headers []Header `json:"headers"`
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:Enum=model;mcpserver
	ResourceType string `json:"resourceType"`
	// +kubebuilder:validation:Optional
	LabelSelector *metav1.LabelSelector `json:"labelSelector,omitempty"`
}

type ExpressionRule struct {
	// Name identifies the rule
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:MinLength=1
	Name string `json:"name"`

	// Expression is a CEL expression that returns a boolean
	// +kubebuilder:validation:Required
	Expression string `json:"expression"`

	// Description explains what the rule validates
	// +optional
	Description string `json:"description,omitempty"`

	// Weight determines the rule's impact on the overall score (default: 1)
	// +optional
	// +kubebuilder:validation:Minimum=0
	Weight int32 `json:"weight,omitempty"`
}

// ResourceSelector defines criteria for selecting resources to evaluate
type ResourceSelector struct {
	// Embed the standard Kubernetes label selector
	metav1.LabelSelector `json:",inline"`

	// ResourceType specifies the type of resource to select
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:Enum=Query
	ResourceType string `json:"resourceType"`

	// APIGroup specifies the API group (e.g., "ark.mckinsey.com")
	// +kubebuilder:validation:Optional
	// +kubebuilder:default="ark.mckinsey.com"
	APIGroup string `json:"apiGroup,omitempty"`

	// Namespaces to include (empty means all namespaces)
	// +kubebuilder:validation:Optional
	Namespaces []string `json:"namespaces,omitempty"`

	// NamespaceSelector for more complex namespace selection
	// +kubebuilder:validation:Optional
	NamespaceSelector *metav1.LabelSelector `json:"namespaceSelector,omitempty"`
}
