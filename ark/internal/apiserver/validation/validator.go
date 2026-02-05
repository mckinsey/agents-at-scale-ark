package validation

import (
	"context"
	"fmt"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/storage"
)

type Validator interface {
	ValidateCreate(ctx context.Context, obj runtime.Object) error
	ValidateUpdate(ctx context.Context, oldObj, newObj runtime.Object) error
	ValidateDelete(ctx context.Context, obj runtime.Object) error
}

type StorageValidator struct {
	backend   storage.Backend
	k8sClient client.Client
}

func NewStorageValidator(backend storage.Backend, k8sClient client.Client) *StorageValidator {
	return &StorageValidator{
		backend:   backend,
		k8sClient: k8sClient,
	}
}

func (v *StorageValidator) GetAgent(ctx context.Context, name, namespace string) (*arkv1alpha1.Agent, error) {
	obj, err := v.backend.Get(ctx, "Agent", namespace, name)
	if err != nil {
		return nil, err
	}
	agent, ok := obj.(*arkv1alpha1.Agent)
	if !ok {
		return nil, fmt.Errorf("expected Agent but got %T", obj)
	}
	return agent, nil
}

func (v *StorageValidator) GetTeam(ctx context.Context, name, namespace string) (*arkv1alpha1.Team, error) {
	obj, err := v.backend.Get(ctx, "Team", namespace, name)
	if err != nil {
		return nil, err
	}
	team, ok := obj.(*arkv1alpha1.Team)
	if !ok {
		return nil, fmt.Errorf("expected Team but got %T", obj)
	}
	return team, nil
}

func (v *StorageValidator) GetModel(ctx context.Context, name, namespace string) (*arkv1alpha1.Model, error) {
	obj, err := v.backend.Get(ctx, "Model", namespace, name)
	if err != nil {
		return nil, err
	}
	model, ok := obj.(*arkv1alpha1.Model)
	if !ok {
		return nil, fmt.Errorf("expected Model but got %T", obj)
	}
	return model, nil
}

func (v *StorageValidator) GetTool(ctx context.Context, name, namespace string) (*arkv1alpha1.Tool, error) {
	obj, err := v.backend.Get(ctx, "Tool", namespace, name)
	if err != nil {
		return nil, err
	}
	tool, ok := obj.(*arkv1alpha1.Tool)
	if !ok {
		return nil, fmt.Errorf("expected Tool but got %T", obj)
	}
	return tool, nil
}

func (v *StorageValidator) GetEvaluator(ctx context.Context, name, namespace string) (*arkv1alpha1.Evaluator, error) {
	obj, err := v.backend.Get(ctx, "Evaluator", namespace, name)
	if err != nil {
		return nil, err
	}
	evaluator, ok := obj.(*arkv1alpha1.Evaluator)
	if !ok {
		return nil, fmt.Errorf("expected Evaluator but got %T", obj)
	}
	return evaluator, nil
}

func (v *StorageValidator) GetMCPServer(ctx context.Context, name, namespace string) (*arkv1alpha1.MCPServer, error) {
	obj, err := v.backend.Get(ctx, "MCPServer", namespace, name)
	if err != nil {
		return nil, err
	}
	mcpServer, ok := obj.(*arkv1alpha1.MCPServer)
	if !ok {
		return nil, fmt.Errorf("expected MCPServer but got %T", obj)
	}
	return mcpServer, nil
}

func (v *StorageValidator) ValidateAgentExists(ctx context.Context, name, namespace string) error {
	if name == "" {
		return nil
	}
	_, err := v.GetAgent(ctx, name, namespace)
	if err != nil {
		return fmt.Errorf("agent '%s' does not exist in namespace '%s'", name, namespace)
	}
	return nil
}

func (v *StorageValidator) ValidateTeamExists(ctx context.Context, name, namespace string) error {
	if name == "" {
		return nil
	}
	_, err := v.GetTeam(ctx, name, namespace)
	if err != nil {
		return fmt.Errorf("team '%s' does not exist in namespace '%s'", name, namespace)
	}
	return nil
}

func (v *StorageValidator) ValidateModelExists(ctx context.Context, name, namespace string) error {
	if name == "" {
		return nil
	}
	_, err := v.GetModel(ctx, name, namespace)
	if err != nil {
		return fmt.Errorf("model '%s' does not exist in namespace '%s'", name, namespace)
	}
	return nil
}

func (v *StorageValidator) ValidateToolExists(ctx context.Context, name, namespace string) error {
	if name == "" {
		return nil
	}
	_, err := v.GetTool(ctx, name, namespace)
	if err != nil {
		return fmt.Errorf("tool '%s' does not exist in namespace '%s'", name, namespace)
	}
	return nil
}

func (v *StorageValidator) ValidateEvaluatorExists(ctx context.Context, name, namespace string) error {
	if name == "" {
		return nil
	}
	_, err := v.GetEvaluator(ctx, name, namespace)
	if err != nil {
		return fmt.Errorf("evaluator '%s' does not exist in namespace '%s'", name, namespace)
	}
	return nil
}

func (v *StorageValidator) GetConfigMap(ctx context.Context, name, namespace string) (*corev1.ConfigMap, error) {
	if v.k8sClient == nil {
		return nil, fmt.Errorf("kubernetes client not available for ConfigMap lookup")
	}
	cm := &corev1.ConfigMap{}
	if err := v.k8sClient.Get(ctx, client.ObjectKey{Name: name, Namespace: namespace}, cm); err != nil {
		return nil, err
	}
	return cm, nil
}

func (v *StorageValidator) GetSecret(ctx context.Context, name, namespace string) (*corev1.Secret, error) {
	if v.k8sClient == nil {
		return nil, fmt.Errorf("kubernetes client not available for Secret lookup")
	}
	secret := &corev1.Secret{}
	if err := v.k8sClient.Get(ctx, client.ObjectKey{Name: name, Namespace: namespace}, secret); err != nil {
		return nil, err
	}
	return secret, nil
}

func (v *StorageValidator) ValidateConfigMapKeyExists(ctx context.Context, name, namespace, key string) error {
	if name == "" || key == "" {
		return nil
	}
	cm, err := v.GetConfigMap(ctx, name, namespace)
	if err != nil {
		return fmt.Errorf("configMap '%s' does not exist in namespace '%s': %v", name, namespace, err)
	}
	if _, exists := cm.Data[key]; !exists {
		return fmt.Errorf("key '%s' not found in configMap '%s' in namespace '%s'", key, name, namespace)
	}
	return nil
}

func (v *StorageValidator) ValidateSecretKeyExists(ctx context.Context, name, namespace, key string) error {
	if name == "" || key == "" {
		return nil
	}
	secret, err := v.GetSecret(ctx, name, namespace)
	if err != nil {
		return fmt.Errorf("secret '%s' does not exist in namespace '%s': %v", name, namespace, err)
	}
	if _, exists := secret.Data[key]; !exists {
		return fmt.Errorf("key '%s' not found in secret '%s' in namespace '%s'", key, name, namespace)
	}
	return nil
}

func (v *StorageValidator) ValidateParameters(ctx context.Context, namespace string, parameters []arkv1alpha1.Parameter) error {
	for i, param := range parameters {
		if err := v.validateParameter(ctx, namespace, param, i); err != nil {
			return err
		}
	}
	return nil
}

func (v *StorageValidator) validateParameter(ctx context.Context, namespace string, param arkv1alpha1.Parameter, index int) error {
	if param.Name == "" {
		return fmt.Errorf("parameter[%d]: name cannot be empty", index)
	}

	hasValue := param.Value != ""
	hasValueFrom := param.ValueFrom != nil

	if hasValue && hasValueFrom {
		return fmt.Errorf("parameter[%d] '%s': cannot specify both value and valueFrom", index, param.Name)
	}
	if !hasValue && !hasValueFrom {
		return fmt.Errorf("parameter[%d] '%s': must specify either value or valueFrom", index, param.Name)
	}

	if param.ValueFrom != nil {
		if err := v.validateValueFrom(ctx, namespace, param, index); err != nil {
			return err
		}
	}

	return nil
}

func (v *StorageValidator) validateValueFrom(ctx context.Context, namespace string, param arkv1alpha1.Parameter, index int) error {
	vf := param.ValueFrom
	sources := 0
	if vf.ConfigMapKeyRef != nil {
		sources++
	}
	if vf.SecretKeyRef != nil {
		sources++
	}
	if vf.ServiceRef != nil {
		sources++
	}
	if vf.QueryParameterRef != nil {
		sources++
	}

	if sources != 1 {
		return fmt.Errorf("parameter[%d] '%s': valueFrom must specify exactly one source", index, param.Name)
	}

	if vf.ConfigMapKeyRef != nil {
		if err := v.ValidateConfigMapKeyExists(ctx, vf.ConfigMapKeyRef.Name, namespace, vf.ConfigMapKeyRef.Key); err != nil {
			return fmt.Errorf("parameter[%d] '%s': %s", index, param.Name, err)
		}
	}

	if vf.SecretKeyRef != nil {
		if err := v.ValidateSecretKeyExists(ctx, vf.SecretKeyRef.Name, namespace, vf.SecretKeyRef.Key); err != nil {
			return fmt.Errorf("parameter[%d] '%s': %s", index, param.Name, err)
		}
	}

	if vf.ServiceRef != nil && vf.ServiceRef.Name == "" {
		return fmt.Errorf("parameter[%d] '%s': serviceRef.name cannot be empty", index, param.Name)
	}

	if vf.QueryParameterRef != nil && vf.QueryParameterRef.Name == "" {
		return fmt.Errorf("parameter[%d] '%s': queryParameterRef.name cannot be empty", index, param.Name)
	}

	return nil
}

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
	return ValidateHeaderValue(header.Value, contextPrefix)
}

func ValidateHeaderValue(headerValue arkv1alpha1.HeaderValue, contextPrefix string) error {
	if headerValue.Value == "" && headerValue.ValueFrom == nil {
		return fmt.Errorf("%s: must specify either value or valueFrom", contextPrefix)
	}
	if headerValue.Value != "" && headerValue.ValueFrom != nil {
		return fmt.Errorf("%s: cannot specify both value and valueFrom", contextPrefix)
	}
	if headerValue.ValueFrom != nil {
		return ValidateHeaderValueFrom(headerValue.ValueFrom, contextPrefix)
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

func ValidateOverrides(overrides []arkv1alpha1.Override) error {
	for i, override := range overrides {
		if err := validateOverrideEntry(override, i); err != nil {
			return err
		}
	}
	return nil
}

func validateOverrideEntry(override arkv1alpha1.Override, index int) error {
	if override.ResourceType != "model" && override.ResourceType != "mcpserver" {
		return fmt.Errorf("overrides[%d]: resourceType must be either 'model' or 'mcpserver'", index)
	}

	if len(override.Headers) == 0 {
		return fmt.Errorf("overrides[%d]: headers list cannot be empty", index)
	}

	for j, header := range override.Headers {
		contextPrefix := fmt.Sprintf("overrides[%d].headers[%d]", index, j)
		if err := ValidateHeader(header, contextPrefix); err != nil {
			return err
		}
	}

	return nil
}
