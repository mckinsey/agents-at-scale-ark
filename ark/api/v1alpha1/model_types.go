/* Copyright 2025. McKinsey & Company */

package v1alpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// ModelConfig holds type-specific configuration parameters
type ModelConfig struct {
	// +kubebuilder:validation:Optional
	OpenAI *OpenAIModelConfig `json:"openai,omitempty"`
	// +kubebuilder:validation:Optional
	Azure *AzureModelConfig `json:"azure,omitempty"`
	// +kubebuilder:validation:Optional
	Bedrock *BedrockModelConfig `json:"bedrock,omitempty"`
}

// AzureModelConfig contains Azure OpenAI specific parameters
type AzureModelConfig struct {
	// +kubebuilder:validation:Required
	BaseURL ValueSource `json:"baseUrl"`
	// +kubebuilder:validation:Required
	APIKey ValueSource `json:"apiKey"`
	// +kubebuilder:validation:Optional
	APIVersion *ValueSource `json:"apiVersion,omitempty"`
	// +kubebuilder:validation:Optional
	Headers []Header `json:"headers,omitempty"`
	// +kubebuilder:validation:Optional
	Properties map[string]ValueSource `json:"properties,omitempty"`
}

// OpenAIModelConfig contains OpenAI specific parameters
type OpenAIModelConfig struct {
	// +kubebuilder:validation:Required
	BaseURL ValueSource `json:"baseUrl"`
	// +kubebuilder:validation:Required
	APIKey ValueSource `json:"apiKey"`
	// +kubebuilder:validation:Optional
	Headers []Header `json:"headers,omitempty"`
	// +kubebuilder:validation:Optional
	Properties map[string]ValueSource `json:"properties,omitempty"`
}

// BedrockModelConfig contains AWS Bedrock specific parameters
type BedrockModelConfig struct {
	// +kubebuilder:validation:Optional
	Region *ValueSource `json:"region,omitempty"`
	// +kubebuilder:validation:Optional
	BaseURL *ValueSource `json:"baseUrl,omitempty"`
	// +kubebuilder:validation:Optional
	AccessKeyID *ValueSource `json:"accessKeyId,omitempty"`
	// +kubebuilder:validation:Optional
	SecretAccessKey *ValueSource `json:"secretAccessKey,omitempty"`
	// +kubebuilder:validation:Optional
	SessionToken *ValueSource `json:"sessionToken,omitempty"`
	// +kubebuilder:validation:Optional
	ModelArn *ValueSource `json:"modelArn,omitempty"`
	// +kubebuilder:validation:Optional
	// +kubebuilder:validation:Minimum=1
	// +kubebuilder:validation:Maximum=100000
	MaxTokens *int `json:"maxTokens,omitempty"`
	// +kubebuilder:validation:Optional
	// +kubebuilder:validation:Pattern=^(0(\.\d+)?|1(\.0+)?)$
	Temperature *string `json:"temperature,omitempty"`
	// +kubebuilder:validation:Optional
	Properties map[string]ValueSource `json:"properties,omitempty"`
}

type ModelSpec struct {
	// +kubebuilder:validation:Required
	Model ValueSource `json:"model"`
	// Type specifies the API capability of the model (e.g., completions, embeddings).
	// Deprecated: The values "openai", "azure", "bedrock" are accepted for backward
	// compatibility but will be removed in release 1.0. Use spec.provider instead.
	// +kubebuilder:validation:Optional
	// +kubebuilder:validation:Enum=completions;openai;azure;bedrock
	// +kubebuilder:default=completions
	Type string `json:"type,omitempty"`
	// Provider specifies the AI provider client to use (openai, azure, bedrock).
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:Enum=openai;azure;bedrock
	Provider string `json:"provider"`
	// +kubebuilder:validation:Required
	Config ModelConfig `json:"config"`
	// +kubebuilder:validation:Optional
	// +kubebuilder:default="1m"
	PollInterval *metav1.Duration `json:"pollInterval,omitempty"`
}

type ModelStatus struct {
	// +kubebuilder:validation:Optional
	// ResolvedAddress contains the actual resolved base URL value
	ResolvedAddress string `json:"resolvedAddress,omitempty"`
	// Conditions represent the latest available observations of a model's state
	Conditions []metav1.Condition `json:"conditions,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:printcolumn:name="Type",type=string,JSONPath=`.spec.type`
// +kubebuilder:printcolumn:name="Provider",type=string,JSONPath=`.spec.provider`
// +kubebuilder:printcolumn:name="Model",type=string,JSONPath=`.spec.model.value`
// +kubebuilder:printcolumn:name="Available",type=string,JSONPath=`.status.conditions[?(@.type=="ModelAvailable")].status`
// +kubebuilder:printcolumn:name="Age",type=date,JSONPath=`.metadata.creationTimestamp`

type Model struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   ModelSpec   `json:"spec,omitempty"`
	Status ModelStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true
type ModelList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []Model `json:"items"`
}

func init() {
	SchemeBuilder.Register(&Model{}, &ModelList{})
}
