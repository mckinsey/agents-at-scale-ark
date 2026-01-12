package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"go.uber.org/zap"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/yaml"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

type ExecutionContext struct {
	Config     *Config
	Namespace  string
	JSONOutput bool
	Silent     bool
	Verbose    bool
}

func (c *ExecutionContext) getLogger() *zap.Logger {
	return getLogger(c.Config, c.Verbose, c.Silent, c.JSONOutput)
}

type TargetCommand struct {
	TargetType     string
	TargetName     string
	Input          string
	Timeout        time.Duration
	Parameters     []string
	SessionId      string
	ConversationId string
	ExecutionContext
}

func (c *TargetCommand) Run() error {
	logger := c.getLogger()

	if err := validateTargetType(c.TargetType); err != nil {
		return err
	}

	params, err := parseParameters(c.Parameters)
	if err != nil {
		return fmt.Errorf("failed to parse parameters: %v", err)
	}

	target := &arkv1alpha1.QueryTarget{Type: c.TargetType, Name: c.TargetName}
	query, err := createQuery(c.Input, target, c.Namespace, params, c.SessionId, c.ConversationId, &c.Timeout)
	if err != nil {
		return fmt.Errorf("failed to create query: %v", err)
	}

	if err := submitQuery(c.Config, query); err != nil {
		return fmt.Errorf("failed to create query: %v", err)
	}

	ctx := setupQueryContext(c.Timeout, logger)

	id := &ResourceIdentifier{
		Config:    c.Config,
		Type:      ResourceQuery,
		Name:      query.Name,
		Namespace: c.Namespace,
	}
	var outputMode string
	if c.JSONOutput {
		outputMode = "json"
	} else {
		outputMode = "text"
	}
	outputOpts := &OutputOptions{
		OutputMode: outputMode,
		Verbose:    c.Verbose,
		Quiet:      c.Silent,
	}
	return waitForQueryCompletion(ctx, id, outputOpts)
}

type TriggerCommand struct {
	QueryName      string
	InputOverride  string
	InputFile      string
	Timeout        time.Duration
	Parameters     []string
	SessionId      string
	ConversationId string
	ExecutionContext
}

func (c *TriggerCommand) Run() error {
	logger := c.getLogger()

	if c.InputOverride != "" && c.InputFile != "" {
		return fmt.Errorf("cannot use both --input and --file flags")
	}

	existingQuery, err := getExistingQuery(c.Config, c.QueryName, c.Namespace)
	if err != nil {
		return fmt.Errorf("failed to fetch existing query '%s': %v", c.QueryName, err)
	}

	queryInput := existingQuery.Spec.Input
	if c.InputFile != "" {
		content, err := readInputFile(c.InputFile)
		if err != nil {
			return fmt.Errorf("failed to read input file: %v", err)
		}
		queryInput = runtime.RawExtension{Raw: []byte(content)}
	} else if c.InputOverride != "" {
		queryInput = runtime.RawExtension{Raw: []byte(c.InputOverride)}
	}

	params := existingQuery.Spec.Parameters
	if len(c.Parameters) > 0 {
		parsedParams, err := parseParameters(c.Parameters)
		if err != nil {
			return fmt.Errorf("failed to parse parameters: %v", err)
		}
		params = parsedParams
	}

	newQuery, err := createTriggerQuery(existingQuery, queryInput, params, c.SessionId, c.ConversationId, &c.Timeout)
	if err != nil {
		return fmt.Errorf("failed to create triggered query: %v", err)
	}

	if err := submitQuery(c.Config, newQuery); err != nil {
		return fmt.Errorf("failed to create triggered query: %v", err)
	}

	ctx := setupQueryContext(c.Timeout, logger)

	logger.Info("Triggered query submitted", zap.String("original", c.QueryName), zap.String("new", newQuery.Name))

	id := &ResourceIdentifier{
		Config:    c.Config,
		Type:      ResourceQuery,
		Name:      newQuery.Name,
		Namespace: c.Namespace,
	}
	var outputMode string
	if c.JSONOutput {
		outputMode = "json"
	} else {
		outputMode = "text"
	}
	outputOpts := &OutputOptions{
		OutputMode: outputMode,
		Verbose:    c.Verbose,
		Quiet:      c.Silent,
	}
	return waitForQueryCompletion(ctx, id, outputOpts)
}

type CreateResource struct {
	ResourceType string
	ResourceName string
	Filename     string
	Prompt       string
	ModelRef     string
	Description  string
	Tools        []string
	ExecutionContext
}

func (c *CreateResource) Run() error {
	req := &ResourceRequest{
		Config:    c.Config,
		Type:      c.ResourceType,
		Name:      c.ResourceName,
		Namespace: c.Namespace,
		Filename:  c.Filename,
		AgentSpec: &AgentSpec{
			Prompt:      c.Prompt,
			ModelRef:    c.ModelRef,
			Description: c.Description,
			Tools:       c.Tools,
		},
	}

	if c.Filename != "" {
		id := &ResourceIdentifier{
			Config:    c.Config,
			Type:      getResourceTypeFromString(c.ResourceType),
			Name:      c.ResourceName,
			Namespace: c.Namespace,
		}
		return id.CreateFromFile(c.Filename)
	}

	return req.Create()
}

type QueryExecutionOptions struct {
	Timeout    time.Duration
	Parameters []arkv1alpha1.Parameter
	SessionId  string
}

type ResourceIdentifier struct {
	Config    *Config
	Type      ResourceType
	Name      string
	Namespace string
}

// Get retrieves a resource by name
func (r *ResourceIdentifier) Get(jsonOutput bool) error {
	gvr := GetGVR(r.Type)
	ctx := context.Background()
	resource, err := r.Config.DynamicClient.Resource(gvr).Namespace(r.Namespace).Get(ctx, r.Name, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("failed to get %s '%s': %v", r.Type, r.Name, err)
	}

	if jsonOutput {
		return printResourceJSON(resource)
	}

	return printResourceYAML(resource)
}

// Delete deletes a resource
func (r *ResourceIdentifier) Delete() error {
	gvr := GetGVR(r.Type)
	ctx := context.Background()
	err := r.Config.DynamicClient.Resource(gvr).Namespace(r.Namespace).Delete(ctx, r.Name, metav1.DeleteOptions{})
	if err != nil {
		return fmt.Errorf("failed to delete %s '%s': %v", r.Type, r.Name, err)
	}

	fmt.Fprintf(os.Stderr, "%s '%s' deleted\n", r.Type, r.Name)
	return nil
}

// CreateFromFile creates a resource from a YAML file
func (r *ResourceIdentifier) CreateFromFile(filename string) error {
	data, err := os.ReadFile(filename)
	if err != nil {
		return fmt.Errorf("failed to read file '%s': %v", filename, err)
	}

	var resource unstructured.Unstructured
	if err := yaml.Unmarshal(data, &resource.Object); err != nil {
		return fmt.Errorf("failed to parse YAML: %v", err)
	}

	// Override name and namespace if provided
	resource.SetName(r.Name)
	resource.SetNamespace(r.Namespace)

	gvr := GetGVR(r.Type)
	ctx := context.Background()
	_, err = r.Config.DynamicClient.Resource(gvr).Namespace(r.Namespace).Create(ctx, &resource, metav1.CreateOptions{})
	if err != nil {
		return fmt.Errorf("failed to create %s: %v", r.Type, err)
	}

	fmt.Fprintf(os.Stderr, "%s '%s' created successfully\n", r.Type, r.Name)
	return nil
}

// UpdateFromFile updates a resource from a YAML file
func (r *ResourceIdentifier) UpdateFromFile(filename string) error {
	data, err := os.ReadFile(filename)
	if err != nil {
		return fmt.Errorf("failed to read file '%s': %v", filename, err)
	}

	var resource unstructured.Unstructured
	if err := yaml.Unmarshal(data, &resource.Object); err != nil {
		return fmt.Errorf("failed to parse YAML: %v", err)
	}

	// Override name and namespace if provided
	resource.SetName(r.Name)
	resource.SetNamespace(r.Namespace)

	gvr := GetGVR(r.Type)
	ctx := context.Background()
	_, err = r.Config.DynamicClient.Resource(gvr).Namespace(r.Namespace).Update(ctx, &resource, metav1.UpdateOptions{})
	if err != nil {
		return fmt.Errorf("failed to update %s: %v", r.Type, err)
	}

	fmt.Fprintf(os.Stderr, "%s '%s' updated successfully\n", r.Type, r.Name)
	return nil
}

// CreateFromFlags creates a resource from command flags
func (r *ResourceIdentifier) CreateFromFlags(spec *AgentSpec) error {
	switch r.Type {
	case ResourceAgent:
		return r.createAgentFromFlags(spec)
	default:
		return fmt.Errorf("creating %s from flags is not supported yet", r.Type)
	}
}

// UpdateFromFlags updates a resource from command flags
func (r *ResourceIdentifier) UpdateFromFlags(spec *AgentSpec) error {
	switch r.Type {
	case ResourceAgent:
		return r.updateAgentFromFlags(spec)
	default:
		return fmt.Errorf("updating %s from flags is not supported yet", r.Type)
	}
}

// createAgentFromFlags creates an agent from flags
func (r *ResourceIdentifier) createAgentFromFlags(spec *AgentSpec) error {
	if spec.Prompt == "" {
		return fmt.Errorf("--prompt is required for agent creation")
	}

	agentSpec := arkv1alpha1.AgentSpec{
		Prompt: spec.Prompt,
	}

	// Set model reference if provided, otherwise leave it nil (uses default behavior)
	if spec.ModelRef != "" {
		agentSpec.ModelRef = &arkv1alpha1.AgentModelRef{
			Name: spec.ModelRef,
		}
	}

	// Add tools if provided
	// TODO: "custom" type is deprecated - consider adding --tool-type flag or fetching tool type from cluster
	if len(spec.Tools) > 0 {
		agentTools := make([]arkv1alpha1.AgentTool, 0, len(spec.Tools))
		for _, toolName := range spec.Tools {
			agentTools = append(agentTools, arkv1alpha1.AgentTool{
				Type: "custom",
				Name: toolName,
			})
		}
		agentSpec.Tools = agentTools
	}

	agent := &arkv1alpha1.Agent{
		TypeMeta: metav1.TypeMeta{
			APIVersion: "ark.mckinsey.com/v1alpha1",
			Kind:       "Agent",
		},
		ObjectMeta: metav1.ObjectMeta{
			Name:      r.Name,
			Namespace: r.Namespace,
		},
		Spec: agentSpec,
	}

	// Convert to unstructured
	unstructuredObj, err := runtime.DefaultUnstructuredConverter.ToUnstructured(agent)
	if err != nil {
		return fmt.Errorf("failed to convert agent to unstructured: %v", err)
	}

	resource := &unstructured.Unstructured{Object: unstructuredObj}

	gvr := GetGVR(ResourceAgent)
	ctx := context.Background()
	_, err = r.Config.DynamicClient.Resource(gvr).Namespace(r.Namespace).Create(ctx, resource, metav1.CreateOptions{})
	if err != nil {
		return fmt.Errorf("failed to create agent: %v", err)
	}

	fmt.Fprintf(os.Stderr, "agent '%s' created successfully\n", r.Name)
	return nil
}

// updateAgentFromFlags updates an agent from flags
func (r *ResourceIdentifier) updateAgentFromFlags(spec *AgentSpec) error {
	gvr := GetGVR(ResourceAgent)
	ctx := context.Background()

	// Get existing agent
	resource, err := r.Config.DynamicClient.Resource(gvr).Namespace(r.Namespace).Get(ctx, r.Name, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("failed to get agent '%s': %v", r.Name, err)
	}

	// Update fields if provided
	if spec.Prompt != "" {
		unstructured.SetNestedField(resource.Object, spec.Prompt, "spec", "prompt")
	}
	if spec.ModelRef != "" {
		modelRefObj := map[string]interface{}{
			"name": spec.ModelRef,
		}
		unstructured.SetNestedField(resource.Object, modelRefObj, "spec", "modelRef")
	}

	_, err = r.Config.DynamicClient.Resource(gvr).Namespace(r.Namespace).Update(ctx, resource, metav1.UpdateOptions{})
	if err != nil {
		return fmt.Errorf("failed to update agent: %v", err)
	}

	fmt.Fprintf(os.Stderr, "agent '%s' updated successfully\n", r.Name)
	return nil
}
