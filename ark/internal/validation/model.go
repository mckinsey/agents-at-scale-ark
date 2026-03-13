package validation

import (
	"context"
	"fmt"
	"net"
	"net/url"
	"os"
	"strings"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func getWhitelistedModelProviderDomains() []string {
	domains := os.Getenv("WHITELISTED_MODEL_DOMAINS")
	if domains == "" {
		return nil
	}

	lines := strings.Split(domains, "\n")
	var filtered []string
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" && !strings.HasPrefix(trimmed, "#") {
			filtered = append(filtered, trimmed)
		}
	}
	return filtered
}

func getAllowedPrivateIPRanges() []*net.IPNet {
	ranges := os.Getenv("ALLOWED_PRIVATE_IP_RANGES")
	if ranges == "" {
		return nil
	}

	lines := strings.Split(ranges, "\n")
	cidrs := make([]*net.IPNet, 0, len(lines))
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}

		_, ipNet, err := net.ParseCIDR(trimmed)
		if err != nil {
			continue
		}
		cidrs = append(cidrs, ipNet)
	}
	return cidrs
}

func ValidateBaseURL(baseURL string) error {
	parsed, err := url.Parse(baseURL)
	if err != nil {
		return fmt.Errorf("invalid URL format: %w", err)
	}

	// Block non-network schemes (file://, ftp://, etc.)
	if parsed.Scheme == "file" || parsed.Scheme == "data" || parsed.Scheme == "javascript" || parsed.Scheme == "ftp" {
		return fmt.Errorf("invalid URL format: unsupported scheme %s://", parsed.Scheme)
	}

	// Validate scheme is present
	if parsed.Scheme == "" {
		return fmt.Errorf("invalid URL format: missing scheme")
	}

	// Validate hostname exists (reject malformed URLs like https:///api/v1)
	host := parsed.Hostname()
	if host == "" {
		return fmt.Errorf("URL must contain a hostname")
	}

	// Allow HTTP for internal cluster services (.svc.cluster.local)
	// These cannot be exploited from outside the cluster
	isClusterInternal := strings.HasSuffix(host, ".svc.cluster.local")

	// Enforce HTTPS-only (except for cluster-internal services)
	if !isClusterInternal && parsed.Scheme != "https" {
		return fmt.Errorf("all URLs must use HTTPS; got %s://", parsed.Scheme)
	}

	// Validate IP addresses (block loopback, private IPs, metadata services)
	if ip := net.ParseIP(host); ip != nil {
		if err := validateIPAddress(ip); err != nil {
			return err
		}
	}

	// Domain whitelist (only enforced if configured)
	whitelist := getWhitelistedModelProviderDomains()
	if len(whitelist) > 0 {
		if !isWhitelistedDomain(host, whitelist) {
			return fmt.Errorf("domain not in whitelist: %s (allowed domains: %s)",
				host, strings.Join(whitelist, ", "))
		}
	}

	return nil
}

func validateIPAddress(ip net.IP) error {
	// Block loopback addresses (cannot be overridden by allowlist)
	if ip.IsLoopback() {
		return fmt.Errorf("loopback IP addresses are not allowed: %s", ip.String())
	}

	// Block cloud metadata service IPs (cannot be overridden by allowlist)
	if strings.HasPrefix(ip.String(), "169.254.") {
		return fmt.Errorf("metadata service IP range is not allowed: %s", ip.String())
	}

	// Check private IP allowlist (if configured)
	allowedRanges := getAllowedPrivateIPRanges()
	if len(allowedRanges) > 0 {
		for _, allowedRange := range allowedRanges {
			if allowedRange.Contains(ip) {
				return nil
			}
		}
	}

	// Block private IP ranges (RFC 1918: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
	if ip.IsPrivate() {
		return fmt.Errorf("private IP addresses are not allowed: %s (use ALLOWED_PRIVATE_IP_RANGES to allow specific ranges)", ip.String())
	}

	return nil
}

func isWhitelistedDomain(hostname string, whitelist []string) bool {
	hostname = strings.ToLower(strings.TrimSpace(hostname))

	for _, pattern := range whitelist {
		if matchDomainPattern(hostname, pattern) {
			return true
		}
	}

	return false
}

func matchDomainPattern(hostname, pattern string) bool {
	pattern = strings.ToLower(strings.TrimSpace(pattern))

	if pattern == "" {
		return false
	}

	if strings.HasPrefix(pattern, "*.") {
		suffix := pattern[2:]
		if hostname == suffix {
			return true
		}
		if strings.HasSuffix(hostname, "."+suffix) {
			return true
		}
		return false
	}

	if strings.Contains(pattern, "*") {
		return matchWildcard(hostname, pattern)
	}

	if hostname == pattern {
		return true
	}

	if strings.HasSuffix(hostname, "."+pattern) {
		return true
	}

	return false
}

func matchWildcard(hostname, pattern string) bool {
	if !strings.Contains(pattern, "*") {
		return hostname == pattern
	}

	parts := strings.Split(pattern, "*")
	if len(parts) != 2 {
		return false
	}

	prefix, suffix := parts[0], parts[1]

	if !strings.HasPrefix(hostname, prefix) {
		return false
	}

	if !strings.HasSuffix(hostname, suffix) {
		return false
	}

	return len(hostname) >= len(prefix)+len(suffix)
}

func (v *Validator) ValidateModel(ctx context.Context, model *arkv1alpha1.Model) ([]string, error) {
	if err := v.ValidateValueSource(ctx, &model.Spec.Model, model.GetNamespace(), "spec.model"); err != nil {
		return nil, err
	}

	if err := v.validateProviderConfig(ctx, model); err != nil {
		return nil, err
	}

	return CollectMigrationWarnings(model.Annotations), nil
}

func (v *Validator) validateProviderConfig(ctx context.Context, model *arkv1alpha1.Model) error {
	switch model.Spec.Provider {
	case ProviderAzure:
		return v.validateAzureConfig(ctx, model)
	case ProviderOpenAI:
		return v.validateOpenAIConfig(ctx, model)
	case ProviderBedrock:
		return v.validateBedrockConfig(ctx, model)
	default:
		if model.Spec.Provider == "" {
			if IsDeprecatedProviderInType(model.Spec.Type) {
				return fmt.Errorf("provider is required - update model to migrate '%s' from spec.type to spec.provider", model.Spec.Type)
			}
			return fmt.Errorf("provider is required")
		}
		return fmt.Errorf("unsupported provider: %s", model.Spec.Provider)
	}
}

func (v *Validator) validateAzureAuth(ctx context.Context, azure *arkv1alpha1.AzureModelConfig, ns string) error {
	if azure.Auth == nil {
		if azure.APIKey == nil {
			return fmt.Errorf("spec.config.azure.apiKey or spec.config.azure.auth is required")
		}
		return v.ValidateValueSource(ctx, azure.APIKey, ns, "spec.config.azure.apiKey")
	}
	auth := azure.Auth
	n := 0
	if auth.APIKey != nil {
		n++
	}
	if auth.ManagedIdentity != nil {
		n++
	}
	if auth.WorkloadIdentity != nil {
		n++
	}
	if n != 1 {
		return fmt.Errorf("spec.config.azure.auth must have exactly one of apiKey, managedIdentity, or workloadIdentity")
	}
	if auth.APIKey != nil {
		return v.ValidateValueSource(ctx, auth.APIKey, ns, "spec.config.azure.auth.apiKey")
	}
	if auth.ManagedIdentity != nil && auth.ManagedIdentity.ClientID != nil {
		if err := v.ValidateValueSource(ctx, auth.ManagedIdentity.ClientID, ns, "spec.config.azure.auth.managedIdentity.clientId"); err != nil {
			return err
		}
	}
	if auth.WorkloadIdentity != nil {
		if err := v.ValidateValueSource(ctx, &auth.WorkloadIdentity.ClientID, ns, "spec.config.azure.auth.workloadIdentity.clientId"); err != nil {
			return err
		}
		if err := v.ValidateValueSource(ctx, &auth.WorkloadIdentity.TenantID, ns, "spec.config.azure.auth.workloadIdentity.tenantId"); err != nil {
			return err
		}
	}
	return nil
}

func (v *Validator) validateAzureConfig(ctx context.Context, model *arkv1alpha1.Model) error {
	if model.Spec.Config.Azure == nil {
		return fmt.Errorf("azure configuration is required for azure model type")
	}
	azure := model.Spec.Config.Azure
	ns := model.GetNamespace()
	if err := v.ValidateValueSource(ctx, &azure.BaseURL, ns, "spec.config.azure.baseUrl"); err != nil {
		return err
	}
	if azure.APIVersion != nil {
		if err := v.ValidateValueSource(ctx, azure.APIVersion, ns, "spec.config.azure.apiVersion"); err != nil {
			return err
		}
	}
	if err := v.validateAzureAuth(ctx, azure, ns); err != nil {
		return err
	}
	baseURLValue, err := v.ResolveValueSource(ctx, azure.BaseURL, ns)
	if err != nil {
		return fmt.Errorf("failed to resolve Azure BaseURL: %w", err)
	}
	if err := ValidateBaseURL(baseURLValue); err != nil {
		return fmt.Errorf("spec.config.azure.baseUrl validation failed: %w", err)
	}
	for i, header := range azure.Headers {
		contextPrefix := fmt.Sprintf("spec.config.azure.headers[%d]", i)
		if err := ValidateHeader(header, contextPrefix); err != nil {
			return err
		}
	}
	return nil
}

func (v *Validator) validateOpenAIConfig(ctx context.Context, model *arkv1alpha1.Model) error {
	if model.Spec.Config.OpenAI == nil {
		return fmt.Errorf("openai configuration is required for openai model type")
	}

	ns := model.GetNamespace()
	if err := v.ValidateValueSource(ctx, &model.Spec.Config.OpenAI.BaseURL, ns, "spec.config.openai.baseUrl"); err != nil {
		return err
	}
	if err := v.ValidateValueSource(ctx, &model.Spec.Config.OpenAI.APIKey, ns, "spec.config.openai.apiKey"); err != nil {
		return err
	}

	baseURLValue, err := v.ResolveValueSource(ctx, model.Spec.Config.OpenAI.BaseURL, ns)
	if err != nil {
		return fmt.Errorf("failed to resolve OpenAI BaseURL: %w", err)
	}
	if err := ValidateBaseURL(baseURLValue); err != nil {
		return fmt.Errorf("spec.config.openai.baseUrl validation failed: %w", err)
	}

	for i, header := range model.Spec.Config.OpenAI.Headers {
		contextPrefix := fmt.Sprintf("spec.config.openai.headers[%d]", i)
		if err := ValidateHeader(header, contextPrefix); err != nil {
			return err
		}
	}

	return nil
}

func (v *Validator) validateBedrockConfig(ctx context.Context, model *arkv1alpha1.Model) error {
	if model.Spec.Config.Bedrock == nil {
		return fmt.Errorf("bedrock configuration is required for bedrock model type")
	}

	ns := model.GetNamespace()
	bedrock := model.Spec.Config.Bedrock

	if err := v.validateBedrockBaseURL(ctx, bedrock, ns); err != nil {
		return err
	}

	return v.validateBedrockFields(ctx, bedrock, ns)
}

func (v *Validator) validateBedrockBaseURL(ctx context.Context, bedrock *arkv1alpha1.BedrockModelConfig, ns string) error {
	if bedrock.BaseURL == nil {
		return nil
	}

	if err := v.ValidateValueSource(ctx, bedrock.BaseURL, ns, "spec.config.bedrock.baseUrl"); err != nil {
		return err
	}

	baseURLValue, err := v.ResolveValueSource(ctx, *bedrock.BaseURL, ns)
	if err != nil {
		return fmt.Errorf("failed to resolve Bedrock BaseURL: %w", err)
	}

	if err := ValidateBaseURL(baseURLValue); err != nil {
		return fmt.Errorf("spec.config.bedrock.baseUrl validation failed: %w", err)
	}

	return nil
}

func (v *Validator) validateBedrockFields(ctx context.Context, bedrock *arkv1alpha1.BedrockModelConfig, ns string) error {
	fields := []struct {
		value *arkv1alpha1.ValueSource
		path  string
	}{
		{bedrock.Region, "spec.config.bedrock.region"},
		{bedrock.AccessKeyID, "spec.config.bedrock.accessKeyId"},
		{bedrock.SecretAccessKey, "spec.config.bedrock.secretAccessKey"},
		{bedrock.SessionToken, "spec.config.bedrock.sessionToken"},
		{bedrock.ModelArn, "spec.config.bedrock.modelArn"},
	}

	for _, field := range fields {
		if field.value != nil {
			if err := v.ValidateValueSource(ctx, field.value, ns, field.path); err != nil {
				return err
			}
		}
	}

	return nil
}
