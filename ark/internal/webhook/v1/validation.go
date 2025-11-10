/* Copyright 2025. McKinsey & Company */

package v1

import (
	"context"
	"fmt"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

type ResourceValidator struct {
	Client client.Client
}

func (v *ResourceValidator) ValidateLoadAgent(ctx context.Context, name, namespace string) error {
	if name == "" {
		return nil
	}

	agent := &arkv1alpha1.Agent{}
	key := types.NamespacedName{Name: name, Namespace: namespace}

	if err := v.Client.Get(ctx, key, agent); err != nil {
		return fmt.Errorf("agent '%s' does not exist in namespace '%s': %v", name, namespace, err)
	}

	return nil
}

func (v *ResourceValidator) ValidateLoadTeam(ctx context.Context, name, namespace string) error {
	if name == "" {
		return nil
	}

	team := &arkv1alpha1.Team{}
	key := types.NamespacedName{Name: name, Namespace: namespace}

	if err := v.Client.Get(ctx, key, team); err != nil {
		return fmt.Errorf("team '%s' does not exist in namespace '%s': %v", name, namespace, err)
	}

	return nil
}

func (v *ResourceValidator) ValidateLoadModel(ctx context.Context, name, namespace string) error {
	if name == "" {
		return nil
	}

	model := &arkv1alpha1.Model{}
	key := types.NamespacedName{Name: name, Namespace: namespace}

	if err := v.Client.Get(ctx, key, model); err != nil {
		return fmt.Errorf("model '%s' does not exist in namespace '%s': %v", name, namespace, err)
	}

	return nil
}

func (v *ResourceValidator) ValidateLoadEvaluator(ctx context.Context, name, namespace string) error {
	if name == "" {
		return nil
	}

	evaluator := &arkv1alpha1.Evaluator{}
	key := types.NamespacedName{Name: name, Namespace: namespace}

	if err := v.Client.Get(ctx, key, evaluator); err != nil {
		return fmt.Errorf("evaluator '%s' does not exist in namespace '%s': %v", name, namespace, err)
	}

	return nil
}

func (v *ResourceValidator) ValidateLoadTool(ctx context.Context, name, namespace string) error {
	if name == "" {
		return nil
	}

	tool := &arkv1alpha1.Tool{}
	key := types.NamespacedName{Name: name, Namespace: namespace}

	if err := v.Client.Get(ctx, key, tool); err != nil {
		if client.IgnoreNotFound(err) != nil {
			return fmt.Errorf("failed to get tool '%s' in namespace '%s': %v", name, namespace, err)
		}
		return fmt.Errorf("tool '%s' does not exist in namespace '%s'", name, namespace)
	}

	return nil
}

func (v *ResourceValidator) ValidateLoadConfigMap(ctx context.Context, name, namespace string) error {
	if name == "" {
		return nil
	}

	configMap := &corev1.ConfigMap{}
	key := types.NamespacedName{Name: name, Namespace: namespace}

	if err := v.Client.Get(ctx, key, configMap); err != nil {
		return fmt.Errorf("configMap '%s' does not exist in namespace '%s': %v", name, namespace, err)
	}

	return nil
}

func (v *ResourceValidator) ValidateLoadConfigMapKey(ctx context.Context, name, namespace, key string) error {
	if name == "" || key == "" {
		return nil
	}

	configMap := &corev1.ConfigMap{}
	namespacedName := types.NamespacedName{Name: name, Namespace: namespace}

	if err := v.Client.Get(ctx, namespacedName, configMap); err != nil {
		return fmt.Errorf("configMap '%s' does not exist in namespace '%s': %v", name, namespace, err)
	}

	if _, exists := configMap.Data[key]; !exists {
		return fmt.Errorf("key '%s' not found in configMap '%s' in namespace '%s'", key, name, namespace)
	}

	return nil
}

func (v *ResourceValidator) ValidateLoadSecret(ctx context.Context, name, namespace string) error {
	if name == "" {
		return nil
	}

	secret := &corev1.Secret{}
	key := types.NamespacedName{Name: name, Namespace: namespace}

	if err := v.Client.Get(ctx, key, secret); err != nil {
		return fmt.Errorf("secret '%s' does not exist in namespace '%s': %v", name, namespace, err)
	}

	return nil
}

func (v *ResourceValidator) ValidateLoadSecretKey(ctx context.Context, name, namespace, key string) error {
	if name == "" || key == "" {
		return nil
	}

	secret := &corev1.Secret{}
	namespacedName := types.NamespacedName{Name: name, Namespace: namespace}

	if err := v.Client.Get(ctx, namespacedName, secret); err != nil {
		return fmt.Errorf("secret '%s' does not exist in namespace '%s': %v", name, namespace, err)
	}

	if _, exists := secret.Data[key]; !exists {
		return fmt.Errorf("key '%s' not found in secret '%s' in namespace '%s'", key, name, namespace)
	}

	return nil
}

func (v *ResourceValidator) validateParameterBasics(param arkv1alpha1.Parameter, index int) error {
	if param.Name == "" {
		return fmt.Errorf("parameter[%d]: name cannot be empty", index)
	}
	return nil
}

func (v *ResourceValidator) validateParameterValueSources(param arkv1alpha1.Parameter, index int) error {
	hasValue := param.Value != ""
	hasValueFrom := param.ValueFrom != nil

	if hasValue && hasValueFrom {
		return fmt.Errorf("parameter[%d] '%s': cannot specify both value and valueFrom", index, param.Name)
	}
	if !hasValue && !hasValueFrom {
		return fmt.Errorf("parameter[%d] '%s': must specify either value or valueFrom", index, param.Name)
	}
	return nil
}

func (v *ResourceValidator) validateValueFromSources(param arkv1alpha1.Parameter, index int) error {
	if param.ValueFrom == nil {
		return nil
	}

	sources := 0
	if param.ValueFrom.ConfigMapKeyRef != nil {
		sources++
	}
	if param.ValueFrom.SecretKeyRef != nil {
		sources++
	}
	if param.ValueFrom.ServiceRef != nil {
		sources++
	}
	if param.ValueFrom.QueryParameterRef != nil {
		sources++
	}

	if sources != 1 {
		return fmt.Errorf("parameter[%d] '%s': valueFrom must specify exactly one source", index, param.Name)
	}
	return nil
}

func (v *ResourceValidator) validateParameterReferences(ctx context.Context, namespace string, param arkv1alpha1.Parameter, index int) error {
	if param.ValueFrom == nil {
		return nil
	}

	if param.ValueFrom.ConfigMapKeyRef != nil {
		if err := v.ValidateLoadConfigMapKey(ctx, param.ValueFrom.ConfigMapKeyRef.Name, namespace, param.ValueFrom.ConfigMapKeyRef.Key); err != nil {
			return fmt.Errorf("parameter[%d] '%s': %s", index, param.Name, err)
		}
	}

	if param.ValueFrom.SecretKeyRef != nil {
		if err := v.ValidateLoadSecretKey(ctx, param.ValueFrom.SecretKeyRef.Name, namespace, param.ValueFrom.SecretKeyRef.Key); err != nil {
			return fmt.Errorf("parameter[%d] '%s': %s", index, param.Name, err)
		}
	}

	if param.ValueFrom.ServiceRef != nil {
		if param.ValueFrom.ServiceRef.Name == "" {
			return fmt.Errorf("parameter[%d] '%s': serviceRef.name cannot be empty", index, param.Name)
		}
	}

	if param.ValueFrom.QueryParameterRef != nil {
		if param.ValueFrom.QueryParameterRef.Name == "" {
			return fmt.Errorf("parameter[%d] '%s': queryParameterRef.name cannot be empty", index, param.Name)
		}
	}

	return nil
}

func (v *ResourceValidator) validateSingleParameter(ctx context.Context, namespace string, param arkv1alpha1.Parameter, index int) error {
	if err := v.validateParameterBasics(param, index); err != nil {
		return err
	}

	if err := v.validateParameterValueSources(param, index); err != nil {
		return err
	}

	if err := v.validateValueFromSources(param, index); err != nil {
		return err
	}

	return v.validateParameterReferences(ctx, namespace, param, index)
}

func (v *ResourceValidator) ValidateParameters(ctx context.Context, namespace string, parameters []arkv1alpha1.Parameter) error {
	for i, param := range parameters {
		if err := v.validateSingleParameter(ctx, namespace, param, i); err != nil {
			return err
		}
	}
	return nil
}

// ValidatePollInterval validates that poll interval is not negative
func ValidatePollInterval(pollInterval time.Duration) error {
	if pollInterval < 0 {
		return fmt.Errorf("pollInterval cannot be negative")
	}
	return nil
}

func ValidateHeader(header arkv1alpha1.Header, contextPrefix string) error {
	if header.Name == "" {
		return fmt.Errorf("%s: name is required", contextPrefix)
	}

	if err := ValidateHeaderValue(header.Value, contextPrefix); err != nil {
		return err
	}

	return nil
}

func ValidateHeaderValue(headerValue arkv1alpha1.HeaderValue, contextPrefix string) error {
	if headerValue.Value == "" && headerValue.ValueFrom == nil {
		return fmt.Errorf("%s: must specify either value or valueFrom", contextPrefix)
	}

	if headerValue.Value != "" && headerValue.ValueFrom != nil {
		return fmt.Errorf("%s: cannot specify both value and valueFrom", contextPrefix)
	}

	if headerValue.ValueFrom != nil {
		if err := ValidateHeaderValueFrom(headerValue.ValueFrom, contextPrefix); err != nil {
			return err
		}
	}

	return nil
}

func ValidateHeaderValueFrom(valueFrom *arkv1alpha1.HeaderValueSource, contextPrefix string) error {
	if valueFrom == nil {
		return nil
	}

	hasSecret := valueFrom.SecretKeyRef != nil
	hasConfigMap := valueFrom.ConfigMapKeyRef != nil

	if !hasSecret && !hasConfigMap {
		return fmt.Errorf("%s: valueFrom must specify either secretKeyRef or configMapKeyRef", contextPrefix)
	}

	if hasSecret && hasConfigMap {
		return fmt.Errorf("%s: valueFrom cannot specify both secretKeyRef and configMapKeyRef", contextPrefix)
	}

	return nil
}

func (v *ResourceValidator) ValidateOverrides(overrides []arkv1alpha1.Override) error {
	for i, override := range overrides {
		if err := v.ValidateOverrideEntry(override, i); err != nil {
			return err
		}
	}
	return nil
}

func (v *ResourceValidator) ValidateOverrideEntry(override arkv1alpha1.Override, index int) error {
	if override.ResourceType != "model" && override.ResourceType != "mcpserver" {
		return fmt.Errorf("overrides[%d]: resourceType must be either 'model' or 'mcpserver'", index)
	}

	if len(override.Headers) == 0 {
		return fmt.Errorf("overrides[%d]: headers list cannot be empty", index)
	}

	for j, header := range override.Headers {
		if err := v.ValidateOverrideHeader(header, index, j); err != nil {
			return err
		}
	}

	return nil
}

func (v *ResourceValidator) ValidateOverrideHeader(header arkv1alpha1.Header, overrideIndex, headerIndex int) error {
	contextPrefix := fmt.Sprintf("overrides[%d].headers[%d]", overrideIndex, headerIndex)
	return ValidateHeader(header, contextPrefix)
}
