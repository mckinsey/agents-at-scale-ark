package protocol

const ArkMetadataKey = "ark.mckinsey.com/execution-engine"

type AgentConfig struct {
	Name         string            `json:"name"`
	Namespace    string            `json:"namespace"`
	Prompt       string            `json:"prompt"`
	Description  string            `json:"description"`
	Parameters   []Parameter       `json:"parameters,omitempty"`
	Model        EngineModel       `json:"model"`
	OutputSchema map[string]any    `json:"outputSchema,omitempty"`
	Labels       map[string]string `json:"labels,omitempty"`
}

type EngineModel struct {
	Name   string         `json:"name"`
	Type   string         `json:"type"`
	Config map[string]any `json:"config,omitempty"`
}

type Parameter struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

type ToolDefinition struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  map[string]any `json:"parameters,omitempty"`
}

type HistoryConfig struct {
	Strategy  string `json:"strategy,omitempty"`
	MaxWindow int    `json:"maxWindow,omitempty"`
	MemoryRef string `json:"memoryRef,omitempty"`
}

type EngineMetadata struct {
	Agent         AgentConfig      `json:"agent"`
	Tools         []ToolDefinition `json:"tools,omitempty"`
	History       []any            `json:"history,omitempty"`
	HistoryConfig *HistoryConfig   `json:"historyConfig,omitempty"`
}
