/* Copyright 2025. McKinsey & Company */

// template_deployment.go handles the creation of Kubernetes Deployments and Services
// for template-based agents. When an Agent references an ExecutionEngine that has a
// source.image (rather than an address), Ark creates a dedicated pod for that agent.
//
// Flow:
//  1. Check if agent references an ExecutionEngine with source.image
//  2. If yes, create/update a Deployment running that image
//  3. Create/update a Service to expose the agent's /invoke endpoint
//  4. Store the service address in Agent.status.serviceAddress
//
// Environment variables injected into the container:
//   - Agent identity: ARK_AGENT_NAME, ARK_AGENT_NAMESPACE
//   - Agent config: Each key in agent.spec.config becomes an env var (uppercase, underscores)
//     Example: config.my-config-value → MY_CONFIG_VALUE
//   - Model config: If agent.spec.modelRef is set, ARK_MODEL_* env vars are injected
//
// See the "Model Environment Variable Injection" section below for ARK_MODEL_* details.

package controller

import (
	"context"
	"fmt"
	"strings"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/util/intstr"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	"mckinsey.com/ark/internal/common"
)

const (
	templateAgentPort     = 8080
	templateAgentPortName = "http"
)

// templateDeploymentResult holds the outcome of reconciling a template-based agent.
type templateDeploymentResult struct {
	success        bool   // Whether the reconciliation succeeded
	reason         string // Condition reason if failed
	message        string // Human-readable message if failed
	serviceAddress string // The cluster-internal URL to reach the agent
	isTemplate     bool   // Whether this agent uses a template (vs shared executor)
}

// reconcileTemplateDeployment ensures a Deployment and Service exist for template-based agents.
// Returns early with isTemplate=false if the agent doesn't use a template ExecutionEngine.
func (r *AgentReconciler) reconcileTemplateDeployment(ctx context.Context, agent *arkv1alpha1.Agent) templateDeploymentResult {
	log := logf.FromContext(ctx)

	if agent.Spec.ExecutionEngine == nil {
		return templateDeploymentResult{success: true, isTemplate: false}
	}

	engineNamespace := agent.Namespace
	if agent.Spec.ExecutionEngine.Namespace != "" {
		engineNamespace = agent.Spec.ExecutionEngine.Namespace
	}

	var engine arkv1prealpha1.ExecutionEngine
	engineKey := types.NamespacedName{Name: agent.Spec.ExecutionEngine.Name, Namespace: engineNamespace}
	if err := r.Get(ctx, engineKey, &engine); err != nil {
		if errors.IsNotFound(err) {
			return templateDeploymentResult{
				success: false,
				reason:  "ExecutionEngineNotFound",
				message: fmt.Sprintf("ExecutionEngine '%s' not found", agent.Spec.ExecutionEngine.Name),
			}
		}
		return templateDeploymentResult{
			success: false,
			reason:  "ExecutionEngineError",
			message: fmt.Sprintf("Error fetching ExecutionEngine: %v", err),
		}
	}

	if engine.Spec.Source == nil {
		return templateDeploymentResult{success: true, isTemplate: false}
	}

	image := r.resolveTemplateImage(&engine)
	if image == "" {
		return templateDeploymentResult{
			success:    false,
			reason:     "ImageNotReady",
			message:    "ExecutionEngine image not yet available",
			isTemplate: true,
		}
	}

	if err := r.ensureDeployment(ctx, agent, image); err != nil {
		log.Error(err, "Failed to ensure deployment", "agent", agent.Name)
		return templateDeploymentResult{
			success:    false,
			reason:     "DeploymentFailed",
			message:    fmt.Sprintf("Failed to create deployment: %v", err),
			isTemplate: true,
		}
	}

	if err := r.ensureService(ctx, agent); err != nil {
		log.Error(err, "Failed to ensure service", "agent", agent.Name)
		return templateDeploymentResult{
			success:    false,
			reason:     "ServiceFailed",
			message:    fmt.Sprintf("Failed to create service: %v", err),
			isTemplate: true,
		}
	}

	serviceAddress := fmt.Sprintf("http://%s.%s.svc.cluster.local:%d", agent.Name, agent.Namespace, templateAgentPort)

	return templateDeploymentResult{
		success:        true,
		isTemplate:     true,
		serviceAddress: serviceAddress,
	}
}

// resolveTemplateImage returns the container image to use for the template.
// Prefers status.imageRef (set after build) over spec.source.image.
func (r *AgentReconciler) resolveTemplateImage(engine *arkv1prealpha1.ExecutionEngine) string {
	if engine.Status.ImageRef != "" {
		return engine.Status.ImageRef
	}
	if engine.Spec.Source != nil && engine.Spec.Source.Image != "" {
		return engine.Spec.Source.Image
	}
	return ""
}

// ensureDeployment creates or updates the Deployment for a template agent.
// The deployment runs the template image with config and model info injected as env vars.
func (r *AgentReconciler) ensureDeployment(ctx context.Context, agent *arkv1alpha1.Agent, image string) error {
	log := logf.FromContext(ctx)
	deploymentName := agent.Name

	envVars := r.buildConfigEnvVars(agent)

	modelEnvVars, err := r.buildModelEnvVars(ctx, agent)
	if err != nil {
		log.Error(err, "Failed to resolve model config", "agent", agent.Name)
	} else {
		envVars = append(envVars, modelEnvVars...)
	}

	replicas := int32(1)
	deployment := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      deploymentName,
			Namespace: agent.Namespace,
			Labels: map[string]string{
				"app.kubernetes.io/name":       deploymentName,
				"app.kubernetes.io/managed-by": "ark",
				"ark.mckinsey.com/agent":       agent.Name,
			},
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: &replicas,
			Selector: &metav1.LabelSelector{
				MatchLabels: map[string]string{
					"ark.mckinsey.com/agent": agent.Name,
				},
			},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: map[string]string{
						"app.kubernetes.io/name": deploymentName,
						"ark.mckinsey.com/agent": agent.Name,
					},
				},
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{
						{
							Name:  "agent",
							Image: image,
							Ports: []corev1.ContainerPort{
								{
									Name:          templateAgentPortName,
									ContainerPort: templateAgentPort,
									Protocol:      corev1.ProtocolTCP,
								},
							},
							Env: envVars,
							ReadinessProbe: &corev1.Probe{
								ProbeHandler: corev1.ProbeHandler{
									HTTPGet: &corev1.HTTPGetAction{
										Path: "/health",
										Port: intstr.FromInt(templateAgentPort),
									},
								},
								InitialDelaySeconds: 5,
								PeriodSeconds:       10,
							},
							LivenessProbe: &corev1.Probe{
								ProbeHandler: corev1.ProbeHandler{
									HTTPGet: &corev1.HTTPGetAction{
										Path: "/health",
										Port: intstr.FromInt(templateAgentPort),
									},
								},
								InitialDelaySeconds: 15,
								PeriodSeconds:       20,
							},
						},
					},
				},
			},
		},
	}

	if err := controllerutil.SetControllerReference(agent, deployment, r.Scheme); err != nil {
		return fmt.Errorf("failed to set owner reference: %w", err)
	}

	existing := &appsv1.Deployment{}
	err = r.Get(ctx, client.ObjectKey{Name: deploymentName, Namespace: agent.Namespace}, existing)
	if errors.IsNotFound(err) {
		log.Info("Creating deployment for template agent", "deployment", deploymentName, "image", image)
		return r.Create(ctx, deployment)
	}
	if err != nil {
		return err
	}

	if r.deploymentNeedsUpdate(existing, deployment) {
		log.Info("Updating deployment for template agent", "deployment", deploymentName, "image", image)
		existing.Spec = deployment.Spec
		return r.Update(ctx, existing)
	}

	return nil
}

// deploymentNeedsUpdate checks if the existing deployment differs from desired.
// Compares image and environment variables.
func (r *AgentReconciler) deploymentNeedsUpdate(existing, desired *appsv1.Deployment) bool {
	if len(existing.Spec.Template.Spec.Containers) == 0 || len(desired.Spec.Template.Spec.Containers) == 0 {
		return true
	}
	existingContainer := existing.Spec.Template.Spec.Containers[0]
	desiredContainer := desired.Spec.Template.Spec.Containers[0]

	if existingContainer.Image != desiredContainer.Image {
		return true
	}

	if len(existingContainer.Env) != len(desiredContainer.Env) {
		return true
	}

	existingEnvMap := make(map[string]string)
	for _, env := range existingContainer.Env {
		existingEnvMap[env.Name] = env.Value
	}
	for _, env := range desiredContainer.Env {
		if existingEnvMap[env.Name] != env.Value {
			return true
		}
	}

	return false
}

// buildConfigEnvVars converts Agent.spec.config to environment variables.
// Each config key becomes <KEY> (uppercase, dashes/dots become underscores).
// Also includes ARK_AGENT_NAME and ARK_AGENT_NAMESPACE for agent identity.
func (r *AgentReconciler) buildConfigEnvVars(agent *arkv1alpha1.Agent) []corev1.EnvVar {
	envVars := make([]corev1.EnvVar, 0, len(agent.Spec.Config)+2)

	envVars = append(envVars, corev1.EnvVar{
		Name:  "ARK_AGENT_NAME",
		Value: agent.Name,
	})
	envVars = append(envVars, corev1.EnvVar{
		Name:  "ARK_AGENT_NAMESPACE",
		Value: agent.Namespace,
	})

	for key, value := range agent.Spec.Config {
		envName := toEnvVarName(key)
		envVars = append(envVars, corev1.EnvVar{
			Name:  envName,
			Value: value,
		})
	}

	return envVars
}

// toEnvVarName converts a config key to a valid env var name (uppercase, underscores).
func toEnvVarName(key string) string {
	return strings.ToUpper(strings.NewReplacer("-", "_", ".", "_").Replace(key))
}

// =============================================================================
// Model Environment Variable Injection
// =============================================================================
//
// When an Agent has a modelRef, Ark resolves the Model CRD and injects the model
// configuration as environment variables. This allows template agents to use
// Ark-managed models without hardcoding credentials.
//
// Environment variables injected:
//
//   Common (all model types):
//     ARK_MODEL_NAME       - The model identifier (e.g., "gpt-4o-mini")
//
//   Azure OpenAI (type: azure):
//     ARK_MODEL_API_KEY     - Azure OpenAI API key (resolved from secret)
//     ARK_MODEL_BASE_URL    - Azure endpoint URL
//     ARK_MODEL_API_VERSION - Azure API version (optional, e.g., "2025-01-01-preview")
//
//   OpenAI (type: openai):
//     ARK_MODEL_API_KEY    - OpenAI API key (resolved from secret)
//     ARK_MODEL_BASE_URL   - OpenAI base URL (default: https://api.openai.com/v1)
//
//   AWS Bedrock (type: bedrock):
//     ARK_MODEL_ACCESS_KEY_ID     - AWS access key ID (optional if using IAM roles)
//     ARK_MODEL_SECRET_ACCESS_KEY - AWS secret access key (optional if using IAM roles)
//     ARK_MODEL_SESSION_TOKEN     - AWS session token (optional, for temporary credentials)
//     ARK_MODEL_REGION            - AWS region (e.g., "us-east-1")
//     ARK_MODEL_ARN               - Model ARN for custom/provisioned models (optional)
//
// Example Python usage in a template agent:
//
//   import os
//   from openai import AzureOpenAI
//
//   client = AzureOpenAI(
//       api_key=os.getenv("ARK_MODEL_API_KEY"),
//       azure_endpoint=os.getenv("ARK_MODEL_BASE_URL"),
//       api_version=os.getenv("ARK_MODEL_API_VERSION"),
//   )
//   response = client.chat.completions.create(
//       model=os.getenv("ARK_MODEL_NAME"),
//       messages=[{"role": "user", "content": "Hello"}],
//   )
// =============================================================================

// buildModelEnvVars resolves the Agent's modelRef and returns environment variables
// for the model configuration. If the agent has no modelRef, returns nil.
//
// The function:
//  1. Checks if agent.spec.modelRef is set
//  2. Fetches the referenced Model CRD
//  3. Resolves all ValueSource fields (secrets, configmaps, etc.)
//  4. Returns env vars based on the model type (azure, openai, bedrock)
func (r *AgentReconciler) buildModelEnvVars(ctx context.Context, agent *arkv1alpha1.Agent) ([]corev1.EnvVar, error) {
	if agent.Spec.ModelRef == nil {
		return nil, nil
	}

	// Resolve model namespace - defaults to agent's namespace
	modelNamespace := agent.Namespace
	if agent.Spec.ModelRef.Namespace != "" {
		modelNamespace = agent.Spec.ModelRef.Namespace
	}

	// Fetch the Model CRD
	var model arkv1alpha1.Model
	modelKey := types.NamespacedName{Name: agent.Spec.ModelRef.Name, Namespace: modelNamespace}
	if err := r.Get(ctx, modelKey, &model); err != nil {
		return nil, fmt.Errorf("failed to get model %s: %w", agent.Spec.ModelRef.Name, err)
	}

	// Create resolver for ValueSource fields (handles secrets, configmaps, etc.)
	resolver := common.NewValueSourceResolver(r.Client)
	var envVars []corev1.EnvVar

	// Resolve the model name (e.g., "gpt-4o-mini")
	modelName, err := resolver.ResolveValueSource(ctx, model.Spec.Model, modelNamespace)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve model name: %w", err)
	}
	envVars = append(envVars, corev1.EnvVar{Name: "ARK_MODEL_NAME", Value: modelName})

	// Resolve type-specific configuration
	switch model.Spec.Type {
	case "azure":
		if model.Spec.Config.Azure != nil {
			azureEnvVars, err := r.resolveAzureModelEnvVars(ctx, resolver, model.Spec.Config.Azure, modelNamespace)
			if err != nil {
				return nil, err
			}
			envVars = append(envVars, azureEnvVars...)
		}
	case "openai":
		if model.Spec.Config.OpenAI != nil {
			openaiEnvVars, err := r.resolveOpenAIModelEnvVars(ctx, resolver, model.Spec.Config.OpenAI, modelNamespace)
			if err != nil {
				return nil, err
			}
			envVars = append(envVars, openaiEnvVars...)
		}
	case "bedrock":
		if model.Spec.Config.Bedrock != nil {
			bedrockEnvVars, err := r.resolveBedrockModelEnvVars(ctx, resolver, model.Spec.Config.Bedrock, modelNamespace)
			if err != nil {
				return nil, err
			}
			envVars = append(envVars, bedrockEnvVars...)
		}
	}

	return envVars, nil
}

// resolveAzureModelEnvVars resolves Azure OpenAI model configuration.
// Returns ARK_MODEL_API_KEY, ARK_MODEL_BASE_URL, and optionally ARK_MODEL_API_VERSION.
func (r *AgentReconciler) resolveAzureModelEnvVars(ctx context.Context, resolver *common.ValueSourceResolver, config *arkv1alpha1.AzureModelConfig, namespace string) ([]corev1.EnvVar, error) {
	var envVars []corev1.EnvVar

	// API key is required for Azure
	apiKey, err := resolver.ResolveValueSource(ctx, config.APIKey, namespace)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve Azure API key: %w", err)
	}
	envVars = append(envVars, corev1.EnvVar{Name: "ARK_MODEL_API_KEY", Value: apiKey})

	// Base URL is the Azure endpoint (e.g., https://my-resource.openai.azure.com)
	baseURL, err := resolver.ResolveValueSource(ctx, config.BaseURL, namespace)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve Azure base URL: %w", err)
	}
	envVars = append(envVars, corev1.EnvVar{Name: "ARK_MODEL_BASE_URL", Value: baseURL})

	// API version is optional but commonly used (e.g., "2025-01-01-preview")
	if config.APIVersion != nil {
		apiVersion, err := resolver.ResolveValueSource(ctx, *config.APIVersion, namespace)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve Azure API version: %w", err)
		}
		envVars = append(envVars, corev1.EnvVar{Name: "ARK_MODEL_API_VERSION", Value: apiVersion})
	}

	return envVars, nil
}

// resolveOpenAIModelEnvVars resolves OpenAI model configuration.
// Returns ARK_MODEL_API_KEY and ARK_MODEL_BASE_URL.
func (r *AgentReconciler) resolveOpenAIModelEnvVars(ctx context.Context, resolver *common.ValueSourceResolver, config *arkv1alpha1.OpenAIModelConfig, namespace string) ([]corev1.EnvVar, error) {
	var envVars []corev1.EnvVar

	// API key for OpenAI
	apiKey, err := resolver.ResolveValueSource(ctx, config.APIKey, namespace)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve OpenAI API key: %w", err)
	}
	envVars = append(envVars, corev1.EnvVar{Name: "ARK_MODEL_API_KEY", Value: apiKey})

	// Base URL (typically https://api.openai.com/v1, but can be customized for proxies)
	baseURL, err := resolver.ResolveValueSource(ctx, config.BaseURL, namespace)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve OpenAI base URL: %w", err)
	}
	envVars = append(envVars, corev1.EnvVar{Name: "ARK_MODEL_BASE_URL", Value: baseURL})

	return envVars, nil
}

// resolveBedrockModelEnvVars resolves AWS Bedrock model configuration.
// Returns AWS credentials and region. Credentials are optional if the container
// uses IAM roles for service accounts (IRSA) or instance profiles.
func (r *AgentReconciler) resolveBedrockModelEnvVars(ctx context.Context, resolver *common.ValueSourceResolver, config *arkv1alpha1.BedrockModelConfig, namespace string) ([]corev1.EnvVar, error) {
	var envVars []corev1.EnvVar

	// AWS Access Key ID (optional if using IAM roles)
	if config.AccessKeyID != nil {
		accessKeyID, err := resolver.ResolveValueSource(ctx, *config.AccessKeyID, namespace)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve Bedrock access key ID: %w", err)
		}
		envVars = append(envVars, corev1.EnvVar{Name: "ARK_MODEL_ACCESS_KEY_ID", Value: accessKeyID})
	}

	// AWS Secret Access Key (optional if using IAM roles)
	if config.SecretAccessKey != nil {
		secretAccessKey, err := resolver.ResolveValueSource(ctx, *config.SecretAccessKey, namespace)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve Bedrock secret access key: %w", err)
		}
		envVars = append(envVars, corev1.EnvVar{Name: "ARK_MODEL_SECRET_ACCESS_KEY", Value: secretAccessKey})
	}

	// AWS Session Token (optional, for temporary credentials from STS)
	if config.SessionToken != nil {
		sessionToken, err := resolver.ResolveValueSource(ctx, *config.SessionToken, namespace)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve Bedrock session token: %w", err)
		}
		envVars = append(envVars, corev1.EnvVar{Name: "ARK_MODEL_SESSION_TOKEN", Value: sessionToken})
	}

	// AWS Region (e.g., "us-east-1")
	if config.Region != nil {
		region, err := resolver.ResolveValueSource(ctx, *config.Region, namespace)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve Bedrock region: %w", err)
		}
		envVars = append(envVars, corev1.EnvVar{Name: "ARK_MODEL_REGION", Value: region})
	}

	// Model ARN for custom/provisioned throughput models
	// Example: arn:aws:bedrock:us-east-1:123456789:provisioned-model/my-model
	if config.ModelArn != nil {
		modelArn, err := resolver.ResolveValueSource(ctx, *config.ModelArn, namespace)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve Bedrock model ARN: %w", err)
		}
		envVars = append(envVars, corev1.EnvVar{Name: "ARK_MODEL_ARN", Value: modelArn})
	}

	return envVars, nil
}

// ensureService creates a ClusterIP Service to expose the agent's /invoke endpoint.
// The service is owned by the Agent and will be garbage collected when the Agent is deleted.
func (r *AgentReconciler) ensureService(ctx context.Context, agent *arkv1alpha1.Agent) error {
	log := logf.FromContext(ctx)
	serviceName := agent.Name

	service := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      serviceName,
			Namespace: agent.Namespace,
			Labels: map[string]string{
				"app.kubernetes.io/name":       serviceName,
				"app.kubernetes.io/managed-by": "ark",
				"ark.mckinsey.com/agent":       agent.Name,
			},
		},
		Spec: corev1.ServiceSpec{
			Selector: map[string]string{
				"ark.mckinsey.com/agent": agent.Name,
			},
			Ports: []corev1.ServicePort{
				{
					Name:       templateAgentPortName,
					Port:       templateAgentPort,
					TargetPort: intstr.FromInt(templateAgentPort),
					Protocol:   corev1.ProtocolTCP,
				},
			},
		},
	}

	if err := controllerutil.SetControllerReference(agent, service, r.Scheme); err != nil {
		return fmt.Errorf("failed to set owner reference: %w", err)
	}

	existing := &corev1.Service{}
	err := r.Get(ctx, client.ObjectKey{Name: serviceName, Namespace: agent.Namespace}, existing)
	if errors.IsNotFound(err) {
		log.Info("Creating service for template agent", "service", serviceName)
		return r.Create(ctx, service)
	}
	if err != nil {
		return err
	}

	return nil
}
