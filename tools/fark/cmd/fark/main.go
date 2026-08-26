package main

import (
	"fmt"
	"log"
	"os"

	"github.com/spf13/cobra"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"

	// Import all Kubernetes client auth plugins (e.g. Azure, GCP, OIDC, etc.)
	// to ensure that the dynamic client can make use of them.
	_ "k8s.io/client-go/plugin/pkg/client/auth"
)

func main() {
	config := initializeConfig()
	rootCmd := createRootCommand(config)

	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}

func initializeConfig() *Config {
	kubeConfig, contextNamespace, err := getKubeConfigAndNamespace()
	if err != nil {
		log.Fatalf("Failed to get kubeconfig: %v", err)
	}

	// Print admission warnings the way kubectl does. Without this the client-go
	// default routes them through klog, where they are easy to miss.
	kubeConfig.WarningHandler = rest.NewWarningWriter(os.Stderr, rest.WarningWriterOptions{Deduplicate: true})

	dynamicClient, err := dynamic.NewForConfig(kubeConfig)
	if err != nil {
		log.Fatalf("Failed to create dynamic client: %v", err)
	}

	// Priority: context namespace > "default"
	namespace := contextNamespace
	if namespace == "" {
		namespace = "default"
	}
	port := "8080"

	logger := initLogger()

	return &Config{
		DynamicClient: dynamicClient,
		Namespace:     namespace,
		Port:          port,
		Logger:        logger,
	}
}

func createRootCommand(config *Config) *cobra.Command {
	rootCmd := &cobra.Command{
		Use:   "fark",
		Short: "Fark - Fast Agentic Runtime in Kubernetes",
		Long: `Fark - Fast Agentic Runtime in Kubernetes

A service that provides access to Kubernetes-based agents and teams through Query custom resources.
Can run as a web server providing REST API endpoints, or as a CLI tool for direct queries.

Supports querying individual agents or teams, streaming results in real-time, and managing
agentic workloads across Kubernetes namespaces.`,
		RunE: func(cmd *cobra.Command, args []string) error {
			if len(args) == 0 {
				return cmd.Help()
			}
			return fmt.Errorf("unknown command %q for %q", args[0], cmd.CommandPath())
		},
		SilenceUsage:  true,
		SilenceErrors: true,
	}

	cf := NewCommandFactory(config)
	rootCmd.AddCommand(createServerCommand(config))
	rootCmd.AddCommand(cf.CreateTargetCommand(ResourceAgent, "agent [agent-name] [request...]", "Query agents"))
	rootCmd.AddCommand(cf.CreateTargetCommand(ResourceTeam, "team [team-name] [request...]", "Query teams"))
	rootCmd.AddCommand(cf.CreateTargetCommand(ResourceModel, "model [model-name] [query...]", "Query models"))
	rootCmd.AddCommand(cf.CreateTargetCommand(ResourceTool, "tool [tool-name] [request...]", "Query tools"))
	rootCmd.AddCommand(createQueryCommand(config))

	// Add CRUD commands
	rootCmd.AddCommand(createGetCommand(config))
	rootCmd.AddCommand(createCreateCommand(config))
	rootCmd.AddCommand(createUpdateCommand(config))
	rootCmd.AddCommand(createDeleteCommand(config))

	return rootCmd
}

func getKubeConfigAndNamespace() (*rest.Config, string, error) {
	// Try in-cluster config first
	config, err := rest.InClusterConfig()
	if err == nil {
		// In-cluster - no context namespace available
		return config, "", nil
	}

	// Use kubeconfig file
	kubeconfig := os.Getenv("KUBECONFIG")
	if kubeconfig == "" {
		kubeconfig = os.Getenv("HOME") + "/.kube/config"
	}

	// Load the kubeconfig to get context namespace
	configLoader := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
		&clientcmd.ClientConfigLoadingRules{ExplicitPath: kubeconfig},
		&clientcmd.ConfigOverrides{},
	)

	rawConfig, err := configLoader.RawConfig()
	if err != nil {
		// Fallback to basic config loading
		config, err := clientcmd.BuildConfigFromFlags("", kubeconfig)
		return config, "", err
	}

	// Get current context namespace
	currentContext := rawConfig.CurrentContext
	contextNamespace := ""
	if context, exists := rawConfig.Contexts[currentContext]; exists && context.Namespace != "" {
		contextNamespace = context.Namespace
	}

	// Build the rest config
	config, err = configLoader.ClientConfig()
	return config, contextNamespace, err
}
