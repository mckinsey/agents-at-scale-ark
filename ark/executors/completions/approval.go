package completions

import (
	"encoding/base64"
	"encoding/json"
	"fmt"

	"github.com/openai/openai-go"
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

type ApprovalRequiredError struct {
	ToolCalls []openai.ChatCompletionMessageToolCall
	Context   *ExecutionContextData
}

func (e *ApprovalRequiredError) Error() string {
	toolNames := make([]string, len(e.ToolCalls))
	for i, tc := range e.ToolCalls {
		toolNames[i] = tc.Function.Name
	}
	return fmt.Sprintf("approval required for tool calls: %v", toolNames)
}

func IsApprovalRequired(err error) bool {
	_, ok := err.(*ApprovalRequiredError)
	return ok
}

type ExecutionContextData struct {
	ConversationHistory  string   `json:"conversationHistory"`
	PendingToolCallIndex int      `json:"pendingToolCallIndex"`
	CompletedToolResults []string `json:"completedToolResults"`
	AgentName            string   `json:"agentName"`
	AgentNamespace       string   `json:"agentNamespace"`
}

type ApprovalConfig struct {
	Required       bool
	Timeout        string
	OnTimeout      string
	Approvers      []arkv1alpha1.ApproverRef
	ReasonRequired bool
}

func BuildApprovalConfigMap(tools []arkv1alpha1.AgentTool) map[string]*ApprovalConfig {
	approvalMap := make(map[string]*ApprovalConfig)
	for _, tool := range tools {
		if tool.Approval != nil && tool.Approval.Required {
			config := &ApprovalConfig{
				Required:       tool.Approval.Required,
				OnTimeout:      tool.Approval.OnTimeout,
				Approvers:      tool.Approval.Approvers,
				ReasonRequired: tool.Approval.ReasonRequired,
			}
			if tool.Approval.Timeout != nil {
				config.Timeout = tool.Approval.Timeout.Duration.String()
			}
			approvalMap[tool.Name] = config
		}
	}
	return approvalMap
}

func (a *Agent) RequiresApproval(toolName string) *ApprovalConfig {
	if a.approvalRequiredTools == nil {
		return nil
	}
	return a.approvalRequiredTools[toolName]
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
