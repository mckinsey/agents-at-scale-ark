package genai

import "encoding/json"

type A2ADelegatedToolExtension struct {
	ToolCallID         string `json:"toolCallId,omitempty"`
	ToolName           string `json:"toolName,omitempty"`
	StepID             string `json:"stepId,omitempty"`
	ParentStepID       string `json:"parentStepId,omitempty"`
	DelegatedTaskID    string `json:"delegatedTaskId,omitempty"`
	DelegatedContextID string `json:"delegatedContextId,omitempty"`
	Sequence           *int   `json:"sequence,omitempty"`
}

func buildA2ADelegatedToolExtensionMap(extension A2ADelegatedToolExtension) map[string]interface{} {
	raw, err := json.Marshal(extension)
	if err != nil {
		return nil
	}
	result := map[string]interface{}{}
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil
	}
	if len(result) == 0 {
		return nil
	}
	return result
}

func withA2ADelegatedToolExtension(metadata map[string]interface{}, extension A2ADelegatedToolExtension) map[string]interface{} {
	extensionMap := buildA2ADelegatedToolExtensionMap(extension)
	if len(extensionMap) == 0 {
		return metadata
	}
	if metadata == nil {
		metadata = map[string]interface{}{}
	}
	metadata[A2ADelegatedToolExtensionKey] = extensionMap
	return metadata
}

func copyA2AMetadata(metadata map[string]interface{}) map[string]interface{} {
	if len(metadata) == 0 {
		return nil
	}
	cloned := make(map[string]interface{}, len(metadata))
	for key, value := range metadata {
		cloned[key] = value
	}
	return cloned
}

func mergeA2AMetadata(base, overlay map[string]interface{}) map[string]interface{} {
	if len(base) == 0 && len(overlay) == 0 {
		return nil
	}
	merged := copyA2AMetadata(base)
	if merged == nil {
		merged = map[string]interface{}{}
	}
	for key, value := range overlay {
		merged[key] = value
	}
	return merged
}

func parseA2ADelegatedToolExtension(metadata map[string]interface{}) (A2ADelegatedToolExtension, bool) {
	if len(metadata) == 0 {
		return A2ADelegatedToolExtension{}, false
	}
	value, ok := metadata[A2ADelegatedToolExtensionKey]
	if !ok || value == nil {
		return A2ADelegatedToolExtension{}, false
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return A2ADelegatedToolExtension{}, false
	}
	var extension A2ADelegatedToolExtension
	if err := json.Unmarshal(raw, &extension); err != nil {
		return A2ADelegatedToolExtension{}, false
	}
	return extension, true
}

func resolveA2ADelegatedToolRole(metadata map[string]interface{}) string {
	extension, ok := parseA2ADelegatedToolExtension(metadata)
	if !ok {
		return ""
	}
	if extension.ToolCallID != "" {
		return RoleTool
	}
	return ""
}
