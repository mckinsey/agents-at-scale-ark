package main

import (
	"fmt"
	"time"

	"github.com/spf13/cobra"
)

type flags struct {
	input          string
	inputFile      string
	timeout        time.Duration
	outputMode     string // "text" or "json"
	verbose        bool   // Show detailed events and logs
	quiet          bool   // Suppress events and progress indicators
	namespace      string
	parameters     []string
	sessionId      string
	conversationId string
}

func (f *flags) addTo(cmd *cobra.Command) {
	cmd.Flags().StringVarP(&f.input, "input", "i", "", "Override query input text")
	cmd.Flags().StringVarP(&f.inputFile, "file", "f", "", "File containing query input (max 3MB)")
	cmd.Flags().DurationVar(&f.timeout, "timeout", f.timeout, "Query timeout duration")
	cmd.Flags().StringVarP(&f.outputMode, "output", "o", "text", "Output format: text or json")
	cmd.Flags().BoolVarP(&f.verbose, "verbose", "v", false, "Show detailed events and logs")
	cmd.Flags().BoolVarP(&f.quiet, "quiet", "q", false, "Suppress event logs (spinner still shown)")
	cmd.Flags().StringVarP(&f.namespace, "namespace", "n", "", "Namespace (defaults to configured namespace)")
	cmd.Flags().StringArrayVarP(&f.parameters, "param", "p", nil, "Template parameters in key=value format (can be used multiple times)")
	cmd.Flags().StringVar(&f.sessionId, "session-id", "", "Session ID to associate with the query for tracking")
	cmd.Flags().StringVar(&f.conversationId, "conversation-id", "", "Conversation ID to associate with the query for memory continuity")
}

// validate validates the flag combination and sets defaults
func (f *flags) validate() error {
	if f.verbose && f.quiet {
		return fmt.Errorf("cannot use both --verbose and --quiet flags")
	}

	// Default behavior: show events (verbose) unless quiet is specified
	if !f.verbose && !f.quiet {
		f.verbose = true
	}

	if f.quiet {
		f.verbose = false // Ensure quiet overrides verbose
	}

	if f.outputMode != "text" && f.outputMode != "json" {
		return fmt.Errorf("invalid output mode: %s. Must be 'text' or 'json'", f.outputMode)
	}
	return nil
}
