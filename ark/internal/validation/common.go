package validation

import (
	"context"
	"fmt"
	"strings"
	"time"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/annotations"
)

const schemeHTTP = "http"

type Validator struct {
	Lookup ResourceLookup
}

func NewValidator(lookup ResourceLookup) *Validator {
	return &Validator{Lookup: lookup}
}

func (v *Validator) ResourceExists(ctx context.Context, kind, namespace, name string) error {
	if name == "" {
		return nil
	}
	_, err := v.Lookup.GetResource(ctx, kind, namespace, name)
	if err != nil {
		return fmt.Errorf("%s '%s' does not exist in namespace '%s': %v", strings.ToLower(kind), name, namespace, err)
	}
	return nil
}

func (v *Validator) SecretKeyExists(ctx context.Context, namespace, name, key string) error {
	if name == "" || key == "" {
		return nil
	}
	secret, err := v.Lookup.GetSecret(ctx, namespace, name)
	if err != nil {
		return fmt.Errorf("secret '%s' does not exist in namespace '%s': %v", name, namespace, err)
	}
	if _, exists := secret.Data[key]; !exists {
		return fmt.Errorf("key '%s' not found in secret '%s' in namespace '%s'", key, name, namespace)
	}
	return nil
}

func (v *Validator) ConfigMapKeyExists(ctx context.Context, namespace, name, key string) error {
	if name == "" || key == "" {
		return nil
	}
	cm, err := v.Lookup.GetConfigMap(ctx, namespace, name)
	if err != nil {
		return fmt.Errorf("configMap '%s' does not exist in namespace '%s': %v", name, namespace, err)
	}
	if _, exists := cm.Data[key]; !exists {
		return fmt.Errorf("key '%s' not found in configMap '%s' in namespace '%s'", key, name, namespace)
	}
	return nil
}

func (v *Validator) ResolveValueSource(ctx context.Context, vs arkv1alpha1.ValueSource, namespace string) (string, error) {
	if vs.Value != "" {
		return vs.Value, nil
	}
	if vs.ValueFrom == nil {
		return "", fmt.Errorf("value source must have either value or valueFrom specified")
	}
	if vs.ValueFrom.SecretKeyRef != nil {
		return v.resolveSecretRef(ctx, namespace, vs.ValueFrom.SecretKeyRef.Name, vs.ValueFrom.SecretKeyRef.Key)
	}
	if vs.ValueFrom.ConfigMapKeyRef != nil {
		return v.resolveConfigMapRef(ctx, namespace, vs.ValueFrom.ConfigMapKeyRef.Name, vs.ValueFrom.ConfigMapKeyRef.Key)
	}
	if vs.ValueFrom.ServiceRef != nil {
		return resolveServiceURL(vs.ValueFrom.ServiceRef, namespace)
	}
	return "", fmt.Errorf("no valid valueFrom source specified")
}

func (v *Validator) resolveSecretRef(ctx context.Context, namespace, name, key string) (string, error) {
	secret, err := v.Lookup.GetSecret(ctx, namespace, name)
	if err != nil {
		return "", fmt.Errorf("failed to get secret %s/%s: %w", namespace, name, err)
	}
	val, exists := secret.Data[key]
	if !exists {
		return "", fmt.Errorf("key %s not found in secret %s/%s", key, namespace, name)
	}
	return string(val), nil
}

func (v *Validator) resolveConfigMapRef(ctx context.Context, namespace, name, key string) (string, error) {
	cm, err := v.Lookup.GetConfigMap(ctx, namespace, name)
	if err != nil {
		return "", fmt.Errorf("failed to get configMap %s/%s: %w", namespace, name, err)
	}
	val, exists := cm.Data[key]
	if !exists {
		return "", fmt.Errorf("key %s not found in configMap %s/%s", key, namespace, name)
	}
	return val, nil
}

func resolveServiceURL(ref *arkv1alpha1.ServiceReference, defaultNamespace string) (string, error) {
	if ref.Name == "" {
		return "", fmt.Errorf("service name is required")
	}
	scheme := schemeHTTP
	if ref.Port == "443" {
		scheme = "https"
	}
	ns := ref.Namespace
	if ns == "" {
		ns = defaultNamespace
	}
	url := fmt.Sprintf("%s://%s.%s.svc.cluster.local", scheme, ref.Name, ns)
	if ref.Port != "" {
		url += ":" + ref.Port
	}
	if ref.Path != "" {
		url += ref.Path
	}
	return url, nil
}

func (v *Validator) ValidateParameters(ctx context.Context, namespace string, parameters []arkv1alpha1.Parameter) error {
	for i, param := range parameters {
		if err := v.validateSingleParameter(ctx, namespace, param, i); err != nil {
			return err
		}
	}
	return nil
}

func (v *Validator) validateSingleParameter(ctx context.Context, namespace string, param arkv1alpha1.Parameter, index int) error {
	if param.Name == "" {
		return fmt.Errorf("parameter[%d]: name cannot be empty", index)
	}
	if err := validateParameterSourceExclusivity(param, index); err != nil {
		return err
	}
	if param.ValueFrom != nil {
		return v.validateParameterValueFrom(ctx, namespace, param, index)
	}
	return nil
}

func validateParameterSourceExclusivity(param arkv1alpha1.Parameter, index int) error {
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

func (v *Validator) validateParameterValueFrom(ctx context.Context, namespace string, param arkv1alpha1.Parameter, index int) error {
	if err := validateValueFromSourceCount(param.ValueFrom, param.Name, index); err != nil {
		return err
	}
	if param.ValueFrom.ConfigMapKeyRef != nil {
		if err := v.ConfigMapKeyExists(ctx, namespace, param.ValueFrom.ConfigMapKeyRef.Name, param.ValueFrom.ConfigMapKeyRef.Key); err != nil {
			return fmt.Errorf("parameter[%d] '%s': %s", index, param.Name, err)
		}
	}
	if param.ValueFrom.SecretKeyRef != nil {
		if err := v.SecretKeyExists(ctx, namespace, param.ValueFrom.SecretKeyRef.Name, param.ValueFrom.SecretKeyRef.Key); err != nil {
			return fmt.Errorf("parameter[%d] '%s': %s", index, param.Name, err)
		}
	}
	if param.ValueFrom.ServiceRef != nil && param.ValueFrom.ServiceRef.Name == "" {
		return fmt.Errorf("parameter[%d] '%s': serviceRef.name cannot be empty", index, param.Name)
	}
	if param.ValueFrom.QueryParameterRef != nil && param.ValueFrom.QueryParameterRef.Name == "" {
		return fmt.Errorf("parameter[%d] '%s': queryParameterRef.name cannot be empty", index, param.Name)
	}
	return nil
}

func validateValueFromSourceCount(vf *arkv1alpha1.ValueFromSource, paramName string, index int) error {
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
		return fmt.Errorf("parameter[%d] '%s': valueFrom must specify exactly one source", index, paramName)
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
		if err := ValidateOverrideEntry(override, i); err != nil {
			return err
		}
	}
	return nil
}

func ValidateOverrideEntry(override arkv1alpha1.Override, index int) error {
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

func (v *Validator) ValidateValueSource(ctx context.Context, vs *arkv1alpha1.ValueSource, namespace, fieldName string) error {
	if vs == nil || vs.ValueFrom == nil {
		return nil
	}
	if vs.ValueFrom.SecretKeyRef != nil {
		if err := v.SecretKeyExists(ctx, namespace, vs.ValueFrom.SecretKeyRef.Name, vs.ValueFrom.SecretKeyRef.Key); err != nil {
			return fmt.Errorf("%s: %w", fieldName, err)
		}
	}
	if vs.ValueFrom.ConfigMapKeyRef != nil {
		if err := v.ConfigMapKeyExists(ctx, namespace, vs.ValueFrom.ConfigMapKeyRef.Name, vs.ValueFrom.ConfigMapKeyRef.Key); err != nil {
			return fmt.Errorf("%s: %w", fieldName, err)
		}
	}
	return nil
}

func CollectMigrationWarnings(resourceAnnotations map[string]string) []string {
	var warnings []string
	for key, value := range resourceAnnotations {
		if strings.HasPrefix(key, annotations.MigrationWarningPrefix) {
			warnings = append(warnings, value)
		}
	}
	return warnings
}
