package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"k8s.io/apimachinery/pkg/runtime"
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

type TargetQueryRequest struct {
	Name           string                  `json:"name"`
	Input          string                  `json:"input"`
	Parameters     []arkv1alpha1.Parameter `json:"parameters,omitempty"`
	SessionId      string                  `json:"sessionId,omitempty"`
	ConversationId string                  `json:"conversationId,omitempty"`
}

type TriggerQueryRequest struct {
	QueryName      string                  `json:"queryName"`
	InputOverride  string                  `json:"inputOverride,omitempty"`
	Parameters     []arkv1alpha1.Parameter `json:"parameters,omitempty"`
	SessionId      string                  `json:"sessionId,omitempty"`
	ConversationId string                  `json:"conversationId,omitempty"`
}

func parseTargetQueryRequest(r *http.Request) (*TargetQueryRequest, error) {
	var req TargetQueryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		return nil, fmt.Errorf("invalid JSON: %v", err)
	}
	return &req, nil
}

func parseTriggerQueryRequest(r *http.Request) (*TriggerQueryRequest, error) {
	var req TriggerQueryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		return nil, fmt.Errorf("invalid JSON: %v", err)
	}
	return &req, nil
}

// List-only handlers (GET only)
func handleListAgents(config *Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		handleListResource(config, ResourceAgent, w, r)
	}
}

func handleListTeams(config *Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		handleListResource(config, ResourceTeam, w, r)
	}
}

func handleListModels(config *Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		handleListResource(config, ResourceModel, w, r)
	}
}

func handleListTools(config *Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		handleListResource(config, ResourceTool, w, r)
	}
}

func handleListQueries(config *Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		handleListResource(config, ResourceQuery, w, r)
	}
}

func handleTriggerQueryByName(config *Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Extract query name from path
		queryName := extractNameFromPath(r.URL.Path, "/query/")
		if queryName == "" {
			http.Error(w, "query name is required in path", http.StatusBadRequest)
			return
		}

		handleTriggerQueryWithName(config, w, r, queryName)
	}
}

func handleListResource(config *Config, resourceType ResourceType, w http.ResponseWriter, _ *http.Request) {
	rm := NewResourceManager(config)
	resources, err := rm.ListResources(resourceType, config.Namespace)
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to list %s: %v", resourceType, err), http.StatusInternalServerError)
		return
	}
	writeJSONResponse(w, resources)
}

// Helper function to extract name from URL path
func extractNameFromPath(path, prefix string) string {
	if !strings.HasPrefix(path, prefix) {
		return ""
	}
	name := strings.TrimPrefix(path, prefix)
	name = strings.TrimSuffix(name, "/")
	return name
}

// handleQueryResourceWithPath handles POST requests with name in path
func handleQueryResourceWithPath(config *Config, resourceType ResourceType) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Extract name from path
		pathPrefix := fmt.Sprintf("/%s/", strings.TrimSuffix(string(resourceType), "s"))
		name := extractNameFromPath(r.URL.Path, pathPrefix)
		if name == "" {
			http.Error(w, fmt.Sprintf("%s name is required in path", strings.TrimSuffix(string(resourceType), "s")), http.StatusBadRequest)
			return
		}

		handleQueryResourceWithName(config, resourceType, w, r, name)
	}
}

// handleQueryResourceWithName handles querying with the name already extracted
func handleQueryResourceWithName(config *Config, resourceType ResourceType, w http.ResponseWriter, r *http.Request, name string) {
	// Parse request body to get input and optional parameters
	req, err := parseTargetQueryRequest(r)
	if err != nil {
		http.Error(w, fmt.Sprintf("invalid request: %v", err), http.StatusBadRequest)
		return
	}

	// Override name from path
	req.Name = name

	if req.Input == "" {
		http.Error(w, "input is required", http.StatusBadRequest)
		return
	}

	// Create query target
	target := &arkv1alpha1.QueryTarget{Type: string(resourceType)[:len(resourceType)-1], Name: req.Name}
	query, err := createQuery(req.Input, target, config.Namespace, req.Parameters, req.SessionId, req.ConversationId, nil)
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to create query: %v", err), http.StatusInternalServerError)
		return
	}

	if err := submitQuery(config, query); err != nil {
		http.Error(w, fmt.Sprintf("failed to create query: %v", err), http.StatusInternalServerError)
		return
	}

	flusher, err := setupStreamingResponse(w)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	processor := NewEventProcessor(config)
	processor.StreamQueryEvents(ctx, w, flusher, query.Name)
}

// handleTriggerQueryWithName handles triggering query with name from path
func handleTriggerQueryWithName(config *Config, w http.ResponseWriter, r *http.Request, queryName string) {
	// Parse request body to get optional overrides
	req, err := parseTriggerQueryRequest(r)
	if err != nil {
		http.Error(w, fmt.Sprintf("invalid request: %v", err), http.StatusBadRequest)
		return
	}

	// Override query name from path
	req.QueryName = queryName

	// Get existing query
	existingQuery, err := getExistingQuery(config, req.QueryName, config.Namespace)
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to get query: %v", err), http.StatusNotFound)
		return
	}

	// Use existing input unless overridden
	input := existingQuery.Spec.Input
	if req.InputOverride != "" {
		input = runtime.RawExtension{Raw: []byte(req.InputOverride)}
	}

	// Use existing parameters unless overridden
	params := existingQuery.Spec.Parameters
	if len(req.Parameters) > 0 {
		params = req.Parameters
	}

	// Create triggered query
	newQuery, err := createTriggerQuery(existingQuery, input, params, req.SessionId, req.ConversationId, nil)
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to create trigger query: %v", err), http.StatusInternalServerError)
		return
	}

	if err := submitQuery(config, newQuery); err != nil {
		http.Error(w, fmt.Sprintf("failed to create triggered query: %v", err), http.StatusInternalServerError)
		return
	}

	flusher, err := setupStreamingResponse(w)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	processor := NewEventProcessor(config)
	processor.StreamQueryEvents(ctx, w, flusher, newQuery.Name)
}
