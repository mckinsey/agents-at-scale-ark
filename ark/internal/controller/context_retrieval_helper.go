/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"fmt"
	"strings"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
)

const noContextValue = "none"

type ContextHelper struct {
	client client.Client
}

func NewContextHelper(k8sClient client.Client) *ContextHelper {
	return &ContextHelper{
		client: k8sClient,
	}
}

func (h *ContextHelper) ExtractContextualBackground(ctx context.Context, evaluation *arkv1alpha1.Evaluation) (string, string) {
	log := logf.FromContext(ctx)

	switch evaluation.Spec.Type {
	case "query":
		if evaluation.Spec.Config.QueryRef != nil {
			return h.extractQueryContextualBackground(ctx, evaluation.Spec.Config.QueryRef, evaluation.Namespace)
		}
	case "direct":
		log.Info("Direct evaluation - context should be provided via parameters")
	default:
		log.Info("Unknown evaluation type for context extraction", "type", evaluation.Spec.Type)
	}

	return "", noContextValue
}

type contextInfo struct {
	builder strings.Builder
	source  string
	hasData bool
}

func (ci *contextInfo) isEmpty() bool {
	return !ci.hasData
}

func (ci *contextInfo) getContent() string {
	return ci.builder.String()
}

func (ci *contextInfo) addMemory(memoryContext, memorySource string) {
	ci.builder.WriteString(memoryContext)
	ci.source = memorySource
	ci.hasData = true
}

func (ci *contextInfo) addParameters(params map[string]string) {
	if ci.hasData {
		ci.builder.WriteString("\nAdditional Context:\n")
		ci.source += "_with_params"
	} else {
		ci.builder.WriteString("Context:\n")
		ci.source = "parameters"
		ci.hasData = true
	}

	for key, value := range params {
		ci.builder.WriteString(fmt.Sprintf("- %s: %s\n", key, value))
	}
}

func (h *ContextHelper) fetchQuery(ctx context.Context, queryRef *arkv1alpha1.QueryRef, defaultNamespace string) (arkv1alpha1.Query, error) {
	queryNamespace := queryRef.Namespace
	if queryNamespace == "" {
		queryNamespace = defaultNamespace
	}

	var query arkv1alpha1.Query
	queryKey := client.ObjectKey{
		Name:      queryRef.Name,
		Namespace: queryNamespace,
	}

	err := h.client.Get(ctx, queryKey, &query)
	return query, err
}

func (h *ContextHelper) buildContextInfo(ctx context.Context, query *arkv1alpha1.Query) *contextInfo {
	info := &contextInfo{source: noContextValue}

	h.addMemoryContextIfAvailable(ctx, query, info)

	h.addParameterContextIfAvailable(query, info)

	return info
}

func (h *ContextHelper) addMemoryContextIfAvailable(ctx context.Context, query *arkv1alpha1.Query, info *contextInfo) {
	if query.Spec.Memory == nil || query.Spec.Memory.Name == "" {
		return
	}

	memoryContext, memorySource := h.extractMemoryContext(ctx, query.Spec.Memory, query.Namespace)
	if memoryContext != "" {
		info.addMemory(memoryContext, memorySource)
	}
}

func (h *ContextHelper) addParameterContextIfAvailable(query *arkv1alpha1.Query, info *contextInfo) {
	if len(query.Spec.Parameters) == 0 {
		return
	}

	contextualParams := h.filterContextualParameters(query.Spec.Parameters)
	if len(contextualParams) > 0 {
		info.addParameters(contextualParams)
	}
}

func (h *ContextHelper) extractQueryContextualBackground(ctx context.Context, queryRef *arkv1alpha1.QueryRef, defaultNamespace string) (string, string) {
	log := logf.FromContext(ctx)

	query, err := h.fetchQuery(ctx, queryRef, defaultNamespace)
	if err != nil {
		log.Error(err, "Failed to fetch query for context extraction", "queryName", queryRef.Name)
		return "", noContextValue
	}

	contextInfo := h.buildContextInfo(ctx, &query)
	if contextInfo.isEmpty() {
		log.Info("No contextual background information found", "queryName", query.Name)
		return "", noContextValue
	}

	extractedContext := contextInfo.getContent()
	log.Info("Extracted contextual background information",
		"queryName", query.Name,
		"contextLength", len(extractedContext),
		"contextSource", contextInfo.source)

	return extractedContext, contextInfo.source
}

func (h *ContextHelper) extractMemoryContext(ctx context.Context, memoryRef *arkv1alpha1.MemoryRef, defaultNamespace string) (string, string) {
	log := logf.FromContext(ctx)

	memoryNamespace := memoryRef.Namespace
	if memoryNamespace == "" {
		memoryNamespace = defaultNamespace
	}

	var memory arkv1alpha1.Memory
	memoryKey := client.ObjectKey{
		Name:      memoryRef.Name,
		Namespace: memoryNamespace,
	}

	if err := h.client.Get(ctx, memoryKey, &memory); err != nil {
		log.Error(err, "Failed to fetch memory for context extraction", "memoryName", memoryRef.Name)
		return "", noContextValue
	}

	if memory.Status.LastResolvedAddress != nil && *memory.Status.LastResolvedAddress != "" {
		memoryContext := fmt.Sprintf("Previous conversation history available (stored at: %s)\n", *memory.Status.LastResolvedAddress)
		log.Info("Memory context extracted", "memoryName", memoryRef.Name, "address", *memory.Status.LastResolvedAddress)
		return memoryContext, "memory"
	}

	log.Info("Memory resource found but no conversation history available", "memoryName", memoryRef.Name)
	return "", noContextValue
}

func (h *ContextHelper) filterContextualParameters(params []arkv1alpha1.Parameter) map[string]string {
	contextualParams := make(map[string]string)

	contextualPrefixes := []string{
		"context",
		"background",
		"reference",
		"document",
		"history",
		"previous",
		"retrieved",
		"knowledge",
		"source",
		"material",
	}

	configPrefixes := []string{
		"model.",
		"temperature",
		"max_tokens",
		"top_p",
		"frequency_penalty",
		"presence_penalty",
		"langfuse.",
		"azure_",
		"openai_",
		"anthropic_",
		"google_",
		"ollama_",
		"timeout",
		"retry",
		"endpoint",
		"api_",
		"auth",
		"token",
		"key",
		"secret",
		"threshold",
		"metrics",
		"evaluation.",
	}

	for _, param := range params {
		paramName := strings.ToLower(param.Name)

		isConfig := false
		for _, prefix := range configPrefixes {
			if strings.HasPrefix(paramName, prefix) {
				isConfig = true
				break
			}
		}
		if isConfig {
			continue
		}

		isContextual := false
		for _, prefix := range contextualPrefixes {
			if strings.HasPrefix(paramName, prefix) || strings.Contains(paramName, prefix) {
				isContextual = true
				break
			}
		}

		if isContextual && param.Value != "" {
			contextualParams[param.Name] = param.Value
		}
	}

	return contextualParams
}
