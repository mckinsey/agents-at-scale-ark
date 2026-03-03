package agentcard

import (
	"encoding/json"
	"net/http"
)

type AgentCard struct {
	Name               string            `json:"name"`
	Description        string            `json:"description"`
	URL                string            `json:"url"`
	Version            string            `json:"version"`
	Capabilities       Capabilities      `json:"capabilities"`
	DefaultInputModes  []string          `json:"defaultInputModes"`
	DefaultOutputModes []string          `json:"defaultOutputModes"`
	Skills             []any             `json:"skills"`
	ExecutionProfile   *ExecutionProfile `json:"executionProfile,omitempty"`
}

type Capabilities struct {
	Streaming         bool `json:"streaming"`
	PushNotifications bool `json:"pushNotifications"`
}

type ExecutionProfile struct {
	Schema           string   `json:"schema"`
	ToolMode         string   `json:"toolMode"`
	MemoryMode       string   `json:"memoryMode"`
	StructuredOutput bool     `json:"structuredOutput"`
	Streaming        bool     `json:"streaming"`
	SupportedModels  []string `json:"supportedModels,omitempty"`
}

func NewDefaultCard(url string) *AgentCard {
	return &AgentCard{
		Name:        "ark-query-engine",
		Description: "Built-in Ark execution engine (OpenAI, Azure, Bedrock)",
		URL:         url,
		Version:     "v1",
		Capabilities: Capabilities{
			Streaming:         true,
			PushNotifications: false,
		},
		DefaultInputModes:  []string{"text/plain"},
		DefaultOutputModes: []string{"text/plain"},
		Skills:             []any{},
		ExecutionProfile: &ExecutionProfile{
			Schema:           "https://ark.mckinsey.com/extensions/execution-profile/v1",
			ToolMode:         "callback",
			MemoryMode:       "inline",
			StructuredOutput: true,
			Streaming:        true,
			SupportedModels:  []string{"openai", "azure", "bedrock"},
		},
	}
}

func Handler(card *AgentCard) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(card)
	}
}
