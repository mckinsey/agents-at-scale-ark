package main

import (
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/spf13/cobra"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

func createServerCommand(config *Config) *cobra.Command {
	serverCmd := &cobra.Command{
		Use:   "server",
		Short: "Start the HTTP server",
		Long: `Start the Ark HTTP server to accept REST API requests for query submission and streaming.

Provides endpoints for submitting queries to agents and teams in the Kubernetes cluster.`,
		Example: `  ark server
  ark server --port 9090`,
		Run: func(cmd *cobra.Command, args []string) {
			setupRoutes(config)
			log.Printf("Starting server on port %s", config.Port)
			log.Fatal(http.ListenAndServe(":"+config.Port, nil))
		},
		SilenceUsage:  true,
		SilenceErrors: true,
	}

	serverCmd.Flags().StringVarP(&config.Port, "port", "p", config.Port, "Server port")

	return serverCmd
}

func createQueryCommand(config *Config) *cobra.Command {
	f := &flags{timeout: 5 * time.Minute}

	queryCmd := &cobra.Command{
		Use:   "query [query-name] [query text...]",
		Short: "List queries or trigger a query",
		Long: `List all queries when no arguments provided, or trigger a specific query by name.

When triggering a query:
- Query text can be provided directly as arguments after the query name, or loaded from a file using --file.
- Results are streamed in real-time and automatically cleaned up after completion.
- Use -p key=value to override template parameters.`,
		Example: `  fark query
  fark query my-query
  fark query my-query "New input text"
  fark query my-query -f input.txt -n my-namespace
  fark query my-query -p name=John -p condition=sunny`,
		RunE: func(cmd *cobra.Command, args []string) error {
			if err := f.validate(); err != nil {
				return err
			}

			if len(args) == 0 {
				ns := getNamespaceOrDefault(f.namespace, config.Namespace)
				return runListResourcesCommand(config, ResourceQuery, ns, f.outputMode == "json")
			}

			queryName := args[0]
			ns := getNamespaceOrDefault(f.namespace, config.Namespace)
			resolver := &InputResolver{
				Input:     f.input,
				InputFile: f.inputFile,
				Args:      args[1:],
				Required:  false,
			}
			inputOverride, err := resolver.Resolve()
			if err != nil {
				return err
			}

			opts := TriggerCommand{
				QueryName:      queryName,
				InputOverride:  inputOverride,
				InputFile:      "",
				Timeout:        f.timeout,
				Parameters:     f.parameters,
				SessionId:      f.sessionId,
				ConversationId: f.conversationId,
				ExecutionContext: ExecutionContext{
					Config:     config,
					Namespace:  ns,
					JSONOutput: f.outputMode == "json",
					Silent:     f.quiet,
					Verbose:    f.verbose,
				},
			}
			return handleQueryError(cmd, opts.Run())
		},
		ValidArgsFunction: func(cmd *cobra.Command, args []string, toComplete string) ([]string, cobra.ShellCompDirective) {
			if len(args) == 0 {
				return getResourceCompletions(config, "queries", f.namespace), cobra.ShellCompDirectiveNoFileComp
			}
			return nil, cobra.ShellCompDirectiveNoFileComp
		},
		SilenceUsage:  true,
		SilenceErrors: true,
	}

	f.addTo(queryCmd)
	return queryCmd
}

type listCommandConfig struct {
	use         string
	short       string
	long        string
	example     string
	resourceGVR schema.GroupVersionResource
}

func setupRoutes(config *Config) {
	// List endpoints (GET only)
	http.HandleFunc("/agents", handleListAgents(config))
	http.HandleFunc("/teams", handleListTeams(config))
	http.HandleFunc("/models", handleListModels(config))
	http.HandleFunc("/tools", handleListTools(config))
	http.HandleFunc("/queries", handleListQueries(config))

	// Query endpoints with path parameters (POST only)
	http.HandleFunc("/agent/", handleQueryResourceWithPath(config, ResourceAgent))
	http.HandleFunc("/team/", handleQueryResourceWithPath(config, ResourceTeam))
	http.HandleFunc("/model/", handleQueryResourceWithPath(config, ResourceModel))
	http.HandleFunc("/tool/", handleQueryResourceWithPath(config, ResourceTool))
	http.HandleFunc("/query/", handleTriggerQueryByName(config))
}

func createGetCommand(config *Config) *cobra.Command {
	var namespace string
	var jsonOutput bool

	cmd := &cobra.Command{
		Use:   "get <resource> [name]",
		Short: "Get resource(s)",
		Long: `Get detailed information about a specific resource, or list all resources of a type.

Supported resources: agent, team, model, tool, query`,
		Example: `  fark get agent                    # List all agents
  fark get agent weather-agent      # Get specific agent
  fark get team weather-team -n production
  fark get tool get-forecast --json`,
		Args: cobra.RangeArgs(1, 2),
		RunE: func(cmd *cobra.Command, args []string) error {
			resourceType := args[0]
			ns := getNamespaceOrDefault(namespace, config.Namespace)

			if len(args) == 1 {
				// List resources
				resourceTypeEnum := getResourceTypeFromString(resourceType)
				if resourceTypeEnum == "" {
					return fmt.Errorf("unsupported resource type: %s", resourceType)
				}
				return runListResourcesCommand(config, resourceTypeEnum, ns, jsonOutput)
			} else {
				// Get specific resource
				resourceName := args[1]
				id := &ResourceIdentifier{
					Config:    config,
					Type:      getResourceTypeFromString(resourceType),
					Name:      resourceName,
					Namespace: ns,
				}
				return id.Get(jsonOutput)
			}
		},
		ValidArgsFunction: func(cmd *cobra.Command, args []string, toComplete string) ([]string, cobra.ShellCompDirective) {
			if len(args) == 0 {
				return []string{"agent", "team", "model", "tool", "query"}, cobra.ShellCompDirectiveNoFileComp
			}
			if len(args) == 1 {
				resourceType := args[0] + "s" // Convert to plural
				return getResourceCompletions(config, resourceType, namespace), cobra.ShellCompDirectiveNoFileComp
			}
			return nil, cobra.ShellCompDirectiveNoFileComp
		},
		SilenceUsage:  true,
		SilenceErrors: true,
	}

	cmd.Flags().StringVarP(&namespace, "namespace", "n", "", "Namespace (defaults to configured namespace)")
	cmd.Flags().BoolVarP(&jsonOutput, "json", "j", false, "Output results in JSON format only")
	return cmd
}

func createCreateCommand(config *Config) *cobra.Command {
	var namespace string
	var filename string
	var prompt string
	var modelRef string
	var description string
	var tools []string

	cmd := &cobra.Command{
		Use:   "create <resource> <name>",
		Short: "Create a new resource",
		Long: `Create a new resource from file or command line flags.

Supported resources: agent, team, model, tool`,
		Example: `  fark create agent my-agent -f agent.yaml
  fark create agent weather-agent --prompt "You are a weather assistant" --model default
  fark create agent weather-agent --prompt "Weather assistant" --model default --tools get-coordinates,get-forecast
  fark create team support-team -f team.yaml -n production`,
		Args: cobra.RangeArgs(0, 2),
		RunE: func(cmd *cobra.Command, args []string) error {
			if len(args) == 0 {
				return cmd.Help()
			}
			if len(args) == 1 {
				return cmd.Help()
			}
			resourceType := args[0]
			resourceName := args[1]
			ns := getNamespaceOrDefault(namespace, config.Namespace)
			opts := CreateResource{
				ResourceType: resourceType,
				ResourceName: resourceName,
				Filename:     filename,
				Prompt:       prompt,
				ModelRef:     modelRef,
				Description:  description,
				Tools:        tools,
				ExecutionContext: ExecutionContext{
					Config:     config,
					Namespace:  ns,
					JSONOutput: false,
					Silent:     false,
					Verbose:    false,
				},
			}
			return opts.Run()
		},
		ValidArgsFunction: func(cmd *cobra.Command, args []string, toComplete string) ([]string, cobra.ShellCompDirective) {
			if len(args) == 0 {
				return []string{"agent", "team", "model", "tool"}, cobra.ShellCompDirectiveNoFileComp
			}
			return nil, cobra.ShellCompDirectiveNoFileComp
		},
		SilenceUsage:  true,
		SilenceErrors: true,
	}

	cmd.Flags().StringVarP(&namespace, "namespace", "n", "", "Namespace (defaults to configured namespace)")
	cmd.Flags().StringVarP(&filename, "file", "f", "", "YAML file to create resource from")
	cmd.Flags().StringVar(&prompt, "prompt", "", "Agent prompt (for agent creation)")
	cmd.Flags().StringVar(&modelRef, "model", "", "Model reference (for agent creation)")
	cmd.Flags().StringVar(&description, "description", "", "Resource description")
	cmd.Flags().StringSliceVar(&tools, "tools", nil, "Comma-separated list of tools (for agent creation)")
	return cmd
}

func createUpdateCommand(config *Config) *cobra.Command {
	var namespace string
	var filename string
	var prompt string
	var modelRef string
	var description string

	cmd := &cobra.Command{
		Use:   "update <resource> <name>",
		Short: "Update an existing resource",
		Long: `Update an existing resource from file or command line flags.

Supported resources: agent, team, model, tool`,
		Example: `  fark update agent my-agent -f agent.yaml
  fark update agent weather-agent --prompt "Updated weather assistant prompt"
  fark update team support-team -f team.yaml -n production`,
		Args: cobra.RangeArgs(0, 2),
		RunE: func(cmd *cobra.Command, args []string) error {
			if len(args) == 0 {
				return cmd.Help()
			}
			if len(args) == 1 {
				return fmt.Errorf("resource name is required")
			}
			resourceType := args[0]
			resourceName := args[1]
			ns := getNamespaceOrDefault(namespace, config.Namespace)
			req := &ResourceRequest{
				Config:    config,
				Type:      resourceType,
				Name:      resourceName,
				Namespace: ns,
				Filename:  filename,
				AgentSpec: &AgentSpec{
					Prompt:      prompt,
					ModelRef:    modelRef,
					Description: description,
				},
			}
			return req.Update()
		},
		ValidArgsFunction: func(cmd *cobra.Command, args []string, toComplete string) ([]string, cobra.ShellCompDirective) {
			if len(args) == 0 {
				return []string{"agent", "team", "model", "tool"}, cobra.ShellCompDirectiveNoFileComp
			}
			if len(args) == 1 {
				resourceType := args[0] + "s" // Convert to plural
				return getResourceCompletions(config, resourceType, namespace), cobra.ShellCompDirectiveNoFileComp
			}
			return nil, cobra.ShellCompDirectiveNoFileComp
		},
		SilenceUsage:  true,
		SilenceErrors: true,
	}

	cmd.Flags().StringVarP(&namespace, "namespace", "n", "", "Namespace (defaults to configured namespace)")
	cmd.Flags().StringVarP(&filename, "file", "f", "", "YAML file to update resource from")
	cmd.Flags().StringVar(&prompt, "prompt", "", "Agent prompt (for agent updates)")
	cmd.Flags().StringVar(&modelRef, "model", "", "Model reference (for agent updates)")
	cmd.Flags().StringVar(&description, "description", "", "Resource description")
	return cmd
}

func createDeleteCommand(config *Config) *cobra.Command {
	var namespace string

	cmd := &cobra.Command{
		Use:   "delete <resource> <name>",
		Short: "Delete a resource",
		Long: `Delete a resource by name.

Supported resources: agent, team, model, tool, query`,
		Example: `  fark delete agent my-agent
  fark delete team support-team -n production
  fark delete query old-query`,
		Args: cobra.RangeArgs(0, 2),
		RunE: func(cmd *cobra.Command, args []string) error {
			if len(args) == 0 {
				return cmd.Help()
			}
			if len(args) == 1 {
				return fmt.Errorf("resource name is required")
			}
			resourceType := args[0]
			resourceName := args[1]
			ns := getNamespaceOrDefault(namespace, config.Namespace)
			id := &ResourceIdentifier{
				Config:    config,
				Type:      getResourceTypeFromString(resourceType),
				Name:      resourceName,
				Namespace: ns,
			}
			return id.Delete()
		},
		ValidArgsFunction: func(cmd *cobra.Command, args []string, toComplete string) ([]string, cobra.ShellCompDirective) {
			if len(args) == 0 {
				return []string{"agent", "team", "model", "tool", "query"}, cobra.ShellCompDirectiveNoFileComp
			}
			if len(args) == 1 {
				resourceType := args[0] + "s" // Convert to plural
				return getResourceCompletions(config, resourceType, namespace), cobra.ShellCompDirectiveNoFileComp
			}
			return nil, cobra.ShellCompDirectiveNoFileComp
		},
		SilenceUsage:  true,
		SilenceErrors: true,
	}

	cmd.Flags().StringVarP(&namespace, "namespace", "n", "", "Namespace (defaults to configured namespace)")
	return cmd
}
