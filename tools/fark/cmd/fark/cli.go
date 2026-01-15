package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"go.uber.org/zap"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/dynamic"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

const (
	errFailedToDeleteQuery = "Failed to delete query"
)

// cleanupQuery deletes the query and logs any deletion errors
func cleanupQuery(config *Config, name, namespace string, logger *zap.Logger) {
	if err := deleteQuery(config, name, namespace); err != nil {
		logger.Warn(errFailedToDeleteQuery, zap.Error(err))
	}
}

// handleSpinnerCommands processes spinner start/stop commands
func handleSpinnerCommands(spinner *Spinner, command string) {
	switch command {
	case "start":
		spinner.Start()
	case "stop":
		spinner.Stop()
	}
}

// handleResultError processes query result errors with cleanup
func handleResultError(result *QueryResult, id *ResourceIdentifier) error {
	cleanupQuery(id.Config, id.Name, id.Namespace, id.Config.Logger)
	return result.Error
}

// handleEvent processes event results
func handleEvent(result *QueryResult, logger *zap.Logger, opts *OutputOptions) {
	displayEvent(logger, result.Event, opts)
}

// handleQueryCompletion processes completed queries
func handleQueryCompletion(result *QueryResult, id *ResourceIdentifier, opts *OutputOptions) error {
	if result.Phase == "done" {
		printQueryResults(result.Query, opts.OutputMode)
		cleanupQuery(id.Config, id.Name, id.Namespace, id.Config.Logger)
		return nil
	}

	if result.Phase == "error" {
		errorMessage := getQueryErrorFromEvents(id.Config.DynamicClient, id.Name, id.Namespace, id.Config.Logger)
		cleanupQuery(id.Config, id.Name, id.Namespace, id.Config.Logger)
		return fmt.Errorf("query failed: %s", errorMessage)
	}

	return nil
}

func waitForQueryCompletion(ctx context.Context, id *ResourceIdentifier, opts *OutputOptions) error {
	spinner := NewSpinner()
	defer spinner.Stop()

	watcher := NewQueryWatcher(id.Config, id.Name, id.Namespace, id.Config.Logger)
	resultChan, err := watcher.Watch(ctx)
	if err != nil {
		return fmt.Errorf("failed to start watching query: %v", err)
	}

	spinner.Start()
	var queryCompletionResult *QueryResult

	for {
		select {
		case result, ok := <-resultChan:
			if !ok {
				// Channel closed - grace period expired, we can exit now
				if queryCompletionResult != nil {
					return handleQueryCompletion(queryCompletionResult, id, opts)
				}
				return fmt.Errorf("result channel closed unexpectedly")
			}

			handleSpinnerCommands(spinner, result.SpinnerCommand)

			if result.Error != nil {
				return handleResultError(&result, id)
			}

			if result.IsEvent {
				handleEvent(&result, id.Config.Logger, opts)
				continue
			}

			isQueryCompleted := result.Query != nil && result.Done
			if isQueryCompleted && queryCompletionResult == nil {
				// Store the completion result but continue processing events
				queryCompletionResult = &result
				continue
			}
		case <-ctx.Done():
			return ctx.Err()
		}
	}
}

func getQueryErrorFromEvents(client dynamic.Interface, queryName, namespace string, logger *zap.Logger) string {
	// Get events for this query, sorted by timestamp
	events, err := client.Resource(GetGVR(ResourceEvent)).Namespace(namespace).List(context.Background(), metav1.ListOptions{
		FieldSelector: fmt.Sprintf("involvedObject.name=%s", queryName),
	})
	if err != nil {
		logger.Warn("Failed to get events", zap.Error(err))
		return "unknown error"
	}

	// Look for error events and extract the most recent error message
	var errorMessage string
	for _, item := range events.Items {

		reason, _, _ := unstructured.NestedString(item.Object, "reason")
		message, _, _ := unstructured.NestedString(item.Object, "message")

		if strings.Contains(reason, "Error") {
			errorMessage = message
		}
	}

	if errorMessage == "" {
		return "query failed with unknown error"
	}

	return errorMessage
}

func printQueryResults(query *arkv1alpha1.Query, outputMode string) {
	if outputMode == "json" {
		result := map[string]interface{}{
			"response": query.Status.Response,
		}
		if jsonData, err := json.MarshalIndent(result, "", "  "); err == nil {
			fmt.Println(string(jsonData))
		}
		return
	}

	if outputMode == "silent" {
		return
	}

	// Text output
	if query.Status.Response == nil {
		fmt.Println("No response received")
		return
	}

	// Display response
	fmt.Printf("%s\n", query.Status.Response.Content)
}

// displayEventAsJSON handles JSON output for events
func displayEventAsJSON(obj any, verbose bool) {
	if !verbose {
		return
	}

	unstructuredObj, ok := obj.(*unstructured.Unstructured)
	if !ok {
		return
	}

	eventData := map[string]interface{}{
		"type": "event",
		"data": unstructuredObj.Object,
	}

	if jsonData, err := json.MarshalIndent(eventData, "", "  "); err == nil {
		fmt.Println(string(jsonData))
	}
}

// parseEventDetails extracts and formats event details from message
func parseEventDetails(message string) string {
	var detailMap map[string]interface{}
	_ = json.Unmarshal([]byte(message), &detailMap)

	if len(detailMap) == 0 {
		return " message=" + message
	}

	var detailParts []string
	for k, v := range detailMap {
		if k != "type" && k != "reason" {
			colorCodeKey := colorize(fmt.Sprintf("%v=", k), "90")
			detailParts = append(detailParts, fmt.Sprintf("%s%v", colorCodeKey, v))
		}
	}

	if len(detailParts) == 0 {
		return ""
	}

	return " " + strings.Join(detailParts, " ")
}

// getEventColorCode returns the color code for different event types
func getEventColorCode(eventType string) string {
	switch eventType {
	case "Normal":
		return "32" // Green
	case "Warning":
		return "33" // Yellow
	case "Error":
		return "31" // Red
	default:
		return "0" // Reset
	}
}

func displayEvent(logger *zap.Logger, obj any, opts *OutputOptions) {
	if opts.Quiet {
		return
	}

	if opts.OutputMode == "json" {
		displayEventAsJSON(obj, opts.Verbose)
		return
	}

	unstructuredObj, ok := obj.(*unstructured.Unstructured)
	if !ok {
		return
	}

	eventType, _, _ := unstructured.NestedString(unstructuredObj.Object, "type")
	reason, _, _ := unstructured.NestedString(unstructuredObj.Object, "reason")
	timestamp := time.Now().Format("15:04:05.000")

	// Check for structured event data in annotations
	annotations, found, _ := unstructured.NestedMap(unstructuredObj.Object, "metadata", "annotations")
	var details string
	if found {
		if eventDataJSON, ok := annotations["ark.mckinsey.com/event-data"].(string); ok && eventDataJSON != "" {
			// Display the raw JSON data
			details = " " + eventDataJSON
		}
	}

	// Fall back to message parsing if no structured data
	if details == "" {
		message, _, _ := unstructured.NestedString(unstructuredObj.Object, "message")
		details = parseEventDetails(message)
	}

	colorCode := getEventColorCode(eventType)

	fmt.Fprintf(os.Stderr, "%s %s%s\n", timestamp, colorize(reason, colorCode), details)
}

func colorize(text, colorCode string) string {
	return fmt.Sprintf("\033[%sm%s\033[0m", colorCode, text)
}

func parseLabels(labelStrings []string) (map[string]string, error) {
	labels := make(map[string]string)
	for _, l := range labelStrings {
		parts := strings.SplitN(l, "=", 2)
		if len(parts) != 2 {
			return nil, fmt.Errorf("invalid label format: %s (expected key=value)", l)
		}
		labels[parts[0]] = parts[1]
	}
	return labels, nil
}
