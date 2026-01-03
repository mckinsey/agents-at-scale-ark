/* Copyright 2025. McKinsey & Company */

package v1prealpha1

import (
	corev1 "k8s.io/api/core/v1"
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
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
	// Optional path to append to the service address. For models might be 'v1', for gemini might be 'v1beta/openai', for mcp servers might be 'mcp'.
	Path string `json:"path,omitempty"`
}

type Header struct {
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:MinLength=1
	Name string `json:"name"`
	// +kubebuilder:validation:Required
	Value arkv1alpha1.HeaderValue `json:"value"`
}

type GitSource struct {
	// +kubebuilder:validation:Required
	URL string `json:"url"`
	// +kubebuilder:validation:Optional
	Ref string `json:"ref,omitempty"`
	// +kubebuilder:validation:Optional
	Path string `json:"path,omitempty"`
}

type TemplateSource struct {
	// +kubebuilder:validation:Optional
	Image string `json:"image,omitempty"`
	// +kubebuilder:validation:Optional
	Git *GitSource `json:"git,omitempty"`
}
