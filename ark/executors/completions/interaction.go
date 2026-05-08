package completions

import (
	"encoding/base64"
	"encoding/json"
	"fmt"

	"github.com/openai/openai-go"
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

type InteractionRequiredError struct {
	ToolCalls   []openai.ChatCompletionMessageToolCall
	Interaction *InteractionConfig
	Context     *ExecutionContextData
}

func (e *InteractionRequiredError) Error() string {
	toolNames := make([]string, len(e.ToolCalls))
	for i, tc := range e.ToolCalls {
		toolNames[i] = tc.Function.Name
	}
	return fmt.Sprintf("interaction required for tool calls: %v", toolNames)
}

func IsInteractionRequired(err error) bool {
	_, ok := err.(*InteractionRequiredError)
	return ok
}

type ExecutionContextData struct {
	ConversationHistory  string   `json:"conversationHistory"`
	PendingToolCallIndex int      `json:"pendingToolCallIndex"`
	CompletedToolResults []string `json:"completedToolResults"`
	AgentName            string   `json:"agentName"`
	AgentNamespace       string   `json:"agentNamespace"`
}

type InteractionConfig struct {
	Type         string
	Timeout      string
	OnTimeout    string
	Approval     *ApprovalInteractionConfig
	Input        *InputInteractionConfig
	Selection    *SelectionInteractionConfig
	Confirmation *ConfirmationInteractionConfig
}

type ApprovalInteractionConfig struct {
	Approvers      []arkv1alpha1.ApproverRef
	ReasonRequired bool
}

type InputInteractionConfig struct {
	Schema string
	Prompt string
}

type SelectionInteractionConfig struct {
	Options     []arkv1alpha1.ToolInteractionSelectionOption
	MultiSelect bool
	Prompt      string
}

type ConfirmationInteractionConfig struct {
	AllowEdit bool
	Message   string
}

func BuildInteractionConfigMap(tools []arkv1alpha1.AgentTool) map[string]*InteractionConfig {
	interactionMap := make(map[string]*InteractionConfig)
	for _, tool := range tools {
		if tool.Interaction == nil {
			continue
		}
		config := buildInteractionConfig(tool.Interaction)
		interactionMap[tool.Name] = config
	}
	return interactionMap
}

func buildInteractionConfig(interaction *arkv1alpha1.ToolInteractionConfig) *InteractionConfig {
	config := &InteractionConfig{
		Type:      interaction.Type,
		OnTimeout: interaction.OnTimeout,
	}
	if interaction.Timeout != nil {
		config.Timeout = interaction.Timeout.Duration.String()
	}

	populateTypeSpecificConfig(config, interaction)
	return config
}

func populateTypeSpecificConfig(config *InteractionConfig, interaction *arkv1alpha1.ToolInteractionConfig) {
	switch interaction.Type {
	case "approval":
		if interaction.Approval != nil {
			config.Approval = &ApprovalInteractionConfig{
				Approvers:      interaction.Approval.Approvers,
				ReasonRequired: interaction.Approval.ReasonRequired,
			}
		}
	case "input":
		if interaction.Input != nil {
			config.Input = &InputInteractionConfig{Prompt: interaction.Input.Prompt}
			if interaction.Input.Schema != nil && interaction.Input.Schema.Raw != nil {
				config.Input.Schema = string(interaction.Input.Schema.Raw)
			}
		}
	case "selection":
		if interaction.Selection != nil {
			config.Selection = &SelectionInteractionConfig{
				Options:     interaction.Selection.Options,
				MultiSelect: interaction.Selection.MultiSelect,
				Prompt:      interaction.Selection.Prompt,
			}
		}
	case "confirmation":
		if interaction.Confirmation != nil {
			config.Confirmation = &ConfirmationInteractionConfig{
				AllowEdit: interaction.Confirmation.AllowEdit,
				Message:   interaction.Confirmation.Message,
			}
		}
	}
}

func (a *Agent) RequiresInteraction(toolName string) *InteractionConfig {
	if a.interactionRequiredTools == nil {
		return nil
	}
	return a.interactionRequiredTools[toolName]
}

func SerializeMessages(messages []Message) (string, error) {
	data, err := json.Marshal(messages)
	if err != nil {
		return "", fmt.Errorf("failed to serialize messages: %w", err)
	}
	return base64.StdEncoding.EncodeToString(data), nil
}

func DeserializeMessages(encoded string) ([]Message, error) {
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, fmt.Errorf("failed to decode messages: %w", err)
	}
	var messages []Message
	if err := json.Unmarshal(data, &messages); err != nil {
		return nil, fmt.Errorf("failed to deserialize messages: %w", err)
	}
	return messages, nil
}

func BuildToolCallInfo(tc openai.ChatCompletionMessageToolCall, tool *arkv1alpha1.Tool) arkv1alpha1.ToolCallInfo {
	info := arkv1alpha1.ToolCallInfo{
		ID:        tc.ID,
		Name:      tc.Function.Name,
		Type:      "unknown",
		Arguments: tc.Function.Arguments,
	}

	if tool != nil {
		info.Type = tool.Spec.Type
		info.Description = tool.Spec.Description
		if tool.Spec.Annotations != nil {
			info.Annotations = &arkv1alpha1.ToolCallAnnotations{
				DestructiveHint: tool.Spec.Annotations.DestructiveHint,
				ReadOnlyHint:    tool.Spec.Annotations.ReadOnlyHint,
				IdempotentHint:  tool.Spec.Annotations.IdempotentHint,
				OpenWorldHint:   tool.Spec.Annotations.OpenWorldHint,
			}
		}
	}

	return info
}

func BuildExecutionContext(messages []Message, pendingIndex int, completedResults []string, agentName, agentNamespace string) (*ExecutionContextData, error) {
	serialized, err := SerializeMessages(messages)
	if err != nil {
		return nil, err
	}

	return &ExecutionContextData{
		ConversationHistory:  serialized,
		PendingToolCallIndex: pendingIndex,
		CompletedToolResults: completedResults,
		AgentName:            agentName,
		AgentNamespace:       agentNamespace,
	}, nil
}

func (ctx *ExecutionContextData) ToSpec() arkv1alpha1.ExecutionContext {
	return arkv1alpha1.ExecutionContext{
		ConversationHistory:  ctx.ConversationHistory,
		PendingToolCallIndex: ctx.PendingToolCallIndex,
		CompletedToolResults: ctx.CompletedToolResults,
		AgentName:            ctx.AgentName,
		AgentNamespace:       ctx.AgentNamespace,
	}
}
