package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/spf13/cobra"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

type CommandFactory struct {
	config *Config
}

func NewCommandFactory(config *Config) *CommandFactory {
	return &CommandFactory{config: config}
}

func (cf *CommandFactory) CreateTargetCommand(targetType ResourceType, use, short string) *cobra.Command {
	f := &flags{timeout: 5 * time.Minute}

	cmd := &cobra.Command{
		Use:     use,
		Short:   short,
		Long:    cf.buildLongDescription(targetType),
		Example: cf.buildExamples(targetType),
		RunE: func(cmd *cobra.Command, args []string) error {
			return cf.handleTargetCommand(targetType, f, args)
		},
		ValidArgsFunction: func(cmd *cobra.Command, args []string, toComplete string) ([]string, cobra.ShellCompDirective) {
			if len(args) == 0 {
				return getResourceCompletions(cf.config, string(targetType), f.namespace), cobra.ShellCompDirectiveNoFileComp
			}
			return nil, cobra.ShellCompDirectiveNoFileComp
		},
		SilenceUsage:  true,
		SilenceErrors: true,
	}

	f.addTo(cmd)
	return cmd
}

// determineInputRequired checks if input is required for the target
func (cf *CommandFactory) determineInputRequired(targetType ResourceType, targetName, ns string, parameters []string) bool {
	if targetType != ResourceTool {
		return true
	}

	if len(parameters) > 0 {
		return false
	}

	return cf.isInputRequiredForTool(targetName, ns)
}

// handleInputResolutionError handles errors from input resolution
func (cf *CommandFactory) handleInputResolutionError(err error, targetType ResourceType, targetName, ns string, parameters []string) error {
	shouldShowToolHelp := targetType == ResourceTool && len(parameters) == 0
	if shouldShowToolHelp {
		return cf.showToolParameterHelp(targetName, ns)
	}
	return err
}

// processToolParameters creates JSON input from tool parameters
func (cf *CommandFactory) processToolParameters(targetType ResourceType, targetName, ns, inputOverride string, parameters []string) (string, error) {
	shouldProcessParameters := targetType == ResourceTool && inputOverride == "" && len(parameters) > 0
	if !shouldProcessParameters {
		return inputOverride, nil
	}

	params, err := parseParameters(parameters)
	if err != nil {
		return "", fmt.Errorf("failed to parse parameters: %v", err)
	}

	paramMap, err := cf.convertParametersWithTypes(targetName, ns, params)
	if err != nil {
		return "", fmt.Errorf("failed to convert parameters: %v", err)
	}

	jsonBytes, err := json.Marshal(paramMap)
	if err != nil {
		return "", fmt.Errorf("failed to create JSON from parameters: %v", err)
	}

	return string(jsonBytes), nil
}

// setDefaultInputForTool sets default empty JSON for tools without required input
func (cf *CommandFactory) setDefaultInputForTool(targetType ResourceType, inputOverride string, inputRequired bool) string {
	needsDefaultInput := targetType == ResourceTool && inputOverride == "" && !inputRequired
	if needsDefaultInput {
		return "{}"
	}
	return inputOverride
}

// createTargetCommand creates a TargetCommand with the provided parameters
func (cf *CommandFactory) createTargetCommand(targetType ResourceType, targetName, inputOverride, ns string, f *flags) *TargetCommand {
	singularType := string(targetType)[:len(targetType)-1] // Remove 's' from end

	return &TargetCommand{
		TargetType:     singularType,
		TargetName:     targetName,
		Input:          inputOverride,
		Timeout:        f.timeout,
		Parameters:     f.parameters,
		SessionId:      f.sessionId,
		ConversationId: f.conversationId,
		ExecutionContext: ExecutionContext{
			Config:     cf.config,
			Namespace:  ns,
			JSONOutput: f.outputMode == "json",
			Silent:     f.quiet,
			Verbose:    f.verbose,
		},
	}
}

func (cf *CommandFactory) handleTargetCommand(targetType ResourceType, f *flags, args []string) error {
	if err := f.validate(); err != nil {
		return err
	}

	if len(args) == 0 {
		ns := getNamespaceOrDefault(f.namespace, cf.config.Namespace)
		return runListResourcesCommand(cf.config, targetType, ns, f.outputMode == "json")
	}

	targetName := args[0]
	ns := getNamespaceOrDefault(f.namespace, cf.config.Namespace)

	inputRequired := cf.determineInputRequired(targetType, targetName, ns, f.parameters)

	resolver := &InputResolver{
		Input:     f.input,
		InputFile: f.inputFile,
		Args:      args[1:],
		Required:  inputRequired,
	}

	inputOverride, err := resolver.Resolve()
	if err != nil {
		return cf.handleInputResolutionError(err, targetType, targetName, ns, f.parameters)
	}

	inputOverride, err = cf.processToolParameters(targetType, targetName, ns, inputOverride, f.parameters)
	if err != nil {
		return err
	}

	inputOverride = cf.setDefaultInputForTool(targetType, inputOverride, inputRequired)

	opts := cf.createTargetCommand(targetType, targetName, inputOverride, ns, f)
	return opts.Run()
}

func (cf *CommandFactory) buildLongDescription(targetType ResourceType) string {
	return `List all ` + string(targetType) + ` when no arguments provided, or query a specific ` + string(targetType)[:len(targetType)-1] + ` by name.

When querying:
- Query text can be provided directly as arguments after the name, or loaded from a file using --file.
- Results are streamed in real-time and automatically cleaned up after completion.
- Use -p key=value to provide template parameters.`
}

func (cf *CommandFactory) buildExamples(targetType ResourceType) string {
	singular := string(targetType)[:len(targetType)-1]
	return `  fark ` + singular + `
  fark ` + singular + ` my-` + singular + ` "What is the weather?"
  fark ` + singular + ` my-` + singular + ` -f input.txt -n my-namespace
  fark ` + singular + ` my-` + singular + ` "Hello {{.name}}" -p name=John`
}

// isInputRequiredForTool checks if a tool requires input parameters
func (cf *CommandFactory) isInputRequiredForTool(toolName, namespace string) bool {
	toolGVR := GetGVR(ResourceTool)
	toolResource, err := cf.config.DynamicClient.Resource(toolGVR).Namespace(namespace).Get(
		context.TODO(),
		toolName,
		metav1.GetOptions{},
	)
	if err != nil {
		return true // Default to requiring input if we can't check
	}

	inputSchemaRaw, found, err := unstructured.NestedMap(toolResource.Object, "spec", "inputSchema")
	if err != nil || !found {
		return false // No schema means no required input
	}

	requiredFields, found, err := unstructured.NestedStringSlice(inputSchemaRaw, "required")
	if err != nil || !found {
		return false // No required fields
	}

	return len(requiredFields) > 0 // Input required if there are required fields
}

// showToolParameterHelp displays parameter information for a tool
func (cf *CommandFactory) showToolParameterHelp(toolName, namespace string) error {
	toolGVR := GetGVR(ResourceTool)
	toolResource, err := cf.config.DynamicClient.Resource(toolGVR).Namespace(namespace).Get(
		context.TODO(),
		toolName,
		metav1.GetOptions{},
	)
	if err != nil {
		return fmt.Errorf("failed to get tool %s: %v", toolName, err)
	}

	fmt.Fprintf(os.Stderr, "Tool: %s\n\n", toolName)

	// Get tool description if available
	if description, found, _ := unstructured.NestedString(toolResource.Object, "spec", "description"); found && description != "" {
		fmt.Fprintf(os.Stderr, "Description: %s\n\n", description)
	}

	inputSchemaRaw, found, err := unstructured.NestedMap(toolResource.Object, "spec", "inputSchema")
	if err != nil || !found {
		fmt.Fprintln(os.Stderr, "This tool has no parameters and can be called without input:")
		fmt.Fprintf(os.Stderr, "  fark tool %s\n", toolName)
		return nil
	}

	// Check if there are any properties
	properties, found, err := unstructured.NestedMap(inputSchemaRaw, "properties")
	if err != nil || !found || len(properties) == 0 {
		fmt.Fprintln(os.Stderr, "This tool has no parameters and can be called without input:")
		fmt.Fprintf(os.Stderr, "  fark tool %s\n", toolName)
		return nil
	}

	fmt.Fprintln(os.Stderr, "Parameters:")
	parameterInfo := buildParameterInfo(inputSchemaRaw)
	fmt.Fprint(os.Stderr, parameterInfo)

	// Show usage examples
	fmt.Fprintln(os.Stderr, "\nUsage:")

	requiredFields, _, _ := unstructured.NestedStringSlice(inputSchemaRaw, "required")
	if len(requiredFields) == 0 {
		fmt.Fprintf(os.Stderr, "  fark tool %s                        # Call without parameters\n", toolName)
	}
	fmt.Fprintf(os.Stderr, "  fark tool %s '{\"param\":\"value\"}'      # Call with JSON parameters\n", toolName)
	fmt.Fprintf(os.Stderr, "  fark tool %s -p param=value            # Call with parameter flags\n", toolName)
	if len(requiredFields) > 1 {
		fmt.Fprintf(os.Stderr, "  fark tool %s -p param1=value1 -p param2=value2  # Multiple parameters\n", toolName)
	}

	return nil
}

// convertParametersWithTypes converts parameter values to appropriate types based on tool schema
func (cf *CommandFactory) convertParametersWithTypes(toolName, namespace string, params []arkv1alpha1.Parameter) (map[string]interface{}, error) {
	// Get tool schema
	toolGVR := GetGVR(ResourceTool)
	toolResource, err := cf.config.DynamicClient.Resource(toolGVR).Namespace(namespace).Get(
		context.TODO(),
		toolName,
		metav1.GetOptions{},
	)
	if err != nil {
		// If we can't get the schema, return parameters as strings
		paramMap := make(map[string]interface{})
		for _, param := range params {
			paramMap[param.Name] = param.Value
		}
		return paramMap, nil
	}

	inputSchemaRaw, found, err := unstructured.NestedMap(toolResource.Object, "spec", "inputSchema")
	if err != nil || !found {
		// No schema available, return as strings
		paramMap := make(map[string]interface{})
		for _, param := range params {
			paramMap[param.Name] = param.Value
		}
		return paramMap, nil
	}

	properties, found, err := unstructured.NestedMap(inputSchemaRaw, "properties")
	if err != nil || !found {
		// No properties defined, return as strings
		paramMap := make(map[string]interface{})
		for _, param := range params {
			paramMap[param.Name] = param.Value
		}
		return paramMap, nil
	}

	// Convert parameters based on their types in the schema
	paramMap := make(map[string]interface{})
	for _, param := range params {
		// Check if this parameter has a type definition
		if propDef, exists := properties[param.Name]; exists {
			if propMap, ok := propDef.(map[string]interface{}); ok {
				if paramType, found, _ := unstructured.NestedString(propMap, "type"); found {
					convertedValue, convertErr := cf.convertValueByType(param.Value, paramType)
					if convertErr != nil {
						// If conversion fails, use original string value
						paramMap[param.Name] = param.Value
					} else {
						paramMap[param.Name] = convertedValue
					}
				} else {
					paramMap[param.Name] = param.Value
				}
			} else {
				paramMap[param.Name] = param.Value
			}
		} else {
			paramMap[param.Name] = param.Value
		}
	}

	return paramMap, nil
}

// convertValueByType converts a string value to the appropriate type
func (cf *CommandFactory) convertValueByType(value, paramType string) (interface{}, error) {
	switch paramType {
	case "number", "integer":
		if intVal, err := strconv.Atoi(value); err == nil {
			return intVal, nil
		}
		if floatVal, err := strconv.ParseFloat(value, 64); err == nil {
			return floatVal, nil
		}
		return nil, fmt.Errorf("cannot convert '%s' to number", value)
	case "boolean":
		if boolVal, err := strconv.ParseBool(value); err == nil {
			return boolVal, nil
		}
		return nil, fmt.Errorf("cannot convert '%s' to boolean", value)
	case "string":
		return value, nil
	default:
		// Unknown type, return as string
		return value, nil
	}
}
