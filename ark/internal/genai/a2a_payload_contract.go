package genai

import (
	"encoding/json"
	"fmt"

	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

const (
	A2APayloadSchemaDelegatedInvocationV1 = "https://ark.mckinsey.com/payloads/delegated-invocation/v1"
	A2APayloadSchemaStepEventV1           = "https://ark.mckinsey.com/payloads/step-event/v1"
	A2APayloadSchemaToolCallsV1           = "https://ark.mckinsey.com/payloads/tool-calls/v1"
	A2APayloadSchemaToolResultV1          = "https://ark.mckinsey.com/payloads/tool-result/v1"
	A2APayloadSchemaRoleHintV1            = "https://ark.mckinsey.com/payloads/role-hint/v1"
	A2APayloadSchemaToolRequestV1         = "https://ark.mckinsey.com/payloads/tool-request/v1"

	A2AExtensionSchemaExecutionProfileV1 = "https://ark.mckinsey.com/extensions/execution-profile/v1"

	A2APayloadSchemaHistoryV1           = "https://ark.mckinsey.com/payloads/history/v1"
	A2APayloadSchemaUserInputRequestV1  = "https://ark.mckinsey.com/payloads/user-input-request/v1"
	A2APayloadSchemaUserInputResponseV1 = "https://ark.mckinsey.com/payloads/user-input-response/v1"
	A2APayloadSchemaAuthCallbackV1      = "https://ark.mckinsey.com/payloads/auth-callback/v1"
)

type HistoryExtensionV1 struct {
	Messages  []protocol.Message `json:"messages"`
	Truncated bool               `json:"truncated"`
	MaxWindow int                `json:"maxWindow,omitempty"`
}

type DelegatedInvocationPayloadV1 struct {
	Schema     string            `json:"schema"`
	Parameters map[string]string `json:"parameters,omitempty"`
	ContextID  string            `json:"contextId,omitempty"`
}

type RoleHintPayloadV1 struct {
	Schema string `json:"schema"`
	Role   string `json:"role"`
}

type ToolCallPayloadV1 struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

type ToolCallsPayloadV1 struct {
	Schema    string              `json:"schema"`
	ToolCalls []ToolCallPayloadV1 `json:"toolCalls"`
}

type StepEventPayloadV1 struct {
	Schema             string `json:"schema"`
	StepID             string `json:"stepId,omitempty"`
	StepEventID        string `json:"stepEventId,omitempty"`
	StepState          string `json:"stepState,omitempty"`
	StepKind           string `json:"stepKind,omitempty"`
	ToolCallID         string `json:"toolCallId,omitempty"`
	ToolName           string `json:"toolName,omitempty"`
	ParentStepID       string `json:"parentStepId,omitempty"`
	DelegatedTaskID    string `json:"delegatedTaskId,omitempty"`
	DelegatedContextID string `json:"delegatedContextId,omitempty"`
	Sequence           *int   `json:"sequence,omitempty"`
}

type ToolResultPayloadV1 struct {
	Schema             string                   `json:"schema"`
	ToolCallID         string                   `json:"toolCallId,omitempty"`
	ToolName           string                   `json:"toolName,omitempty"`
	Content            string                   `json:"content,omitempty"`
	Error              string                   `json:"error,omitempty"`
	Step               *StepEventPayloadV1      `json:"step,omitempty"`
	DelegatedTaskID    string                   `json:"delegatedTaskId,omitempty"`
	DelegatedContextID string                   `json:"delegatedContextId,omitempty"`
	Message            map[string]interface{}   `json:"message,omitempty"`
	Artifacts          []map[string]interface{} `json:"artifacts,omitempty"`
}

type TeamExtensionV1 struct {
	AgentName string `json:"agentName,omitempty"`
	TeamName  string `json:"teamName,omitempty"`
}

func setTeamExtension(msg *protocol.Message, ext TeamExtensionV1) {
	if msg.Metadata == nil {
		msg.Metadata = make(map[string]interface{})
	}
	msg.Metadata[A2ATeamExtensionKey] = ext
	ensureMessageHasExtension(msg, A2ATeamExtensionKey)
}

func getTeamExtension(msg protocol.Message) (TeamExtensionV1, bool) {
	if msg.Metadata == nil {
		return TeamExtensionV1{}, false
	}
	raw, ok := msg.Metadata[A2ATeamExtensionKey]
	if !ok {
		return TeamExtensionV1{}, false
	}
	data, err := json.Marshal(raw)
	if err != nil {
		return TeamExtensionV1{}, false
	}
	var ext TeamExtensionV1
	if err := json.Unmarshal(data, &ext); err != nil {
		return TeamExtensionV1{}, false
	}
	return ext, true
}

func getAgentNameFromMessage(msg protocol.Message) string {
	if ext, ok := getTeamExtension(msg); ok && ext.AgentName != "" {
		return ext.AgentName
	}
	if msg.Metadata != nil {
		if name, ok := msg.Metadata[MetadataAgentNameKey].(string); ok {
			return name
		}
	}
	return ""
}

func appendPayloadPart(parts []protocol.Part, payload interface{}) []protocol.Part {
	return append(parts, &protocol.DataPart{
		Kind: protocol.KindData,
		Data: payload,
	})
}

func appendPayloadPartToMessage(message *protocol.Message, payload interface{}) {
	if message == nil {
		return
	}
	message.Parts = appendPayloadPart(message.Parts, payload)
}

func buildToolResultPayloadContent(payload ToolResultPayloadV1) (string, error) {
	if payload.Schema == "" {
		payload.Schema = A2APayloadSchemaToolResultV1
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("failed to serialize tool-result payload: %w", err)
	}
	return string(raw), nil
}

type ToolRequestPayloadV1 struct {
	Schema string             `json:"schema"`
	Calls  []ToolRequestCall  `json:"calls"`
}

type ToolRequestCall struct {
	ToolCallID string `json:"toolCallId"`
	ToolName   string `json:"toolName"`
	Arguments  string `json:"arguments"`
}

type ToolResultPayloadV2 struct {
	Schema  string              `json:"schema"`
	Results []ToolResultEntryV2 `json:"results"`
}

type ToolResultEntryV2 struct {
	ToolCallID string `json:"toolCallId"`
	ToolName   string `json:"toolName"`
	Content    string `json:"content"`
	Error      string `json:"error,omitempty"`
}

func parseToolRequestPayload(msg *protocol.Message) *ToolRequestPayloadV1 {
	if msg == nil {
		return nil
	}
	for _, part := range msg.Parts {
		dp, ok := part.(*protocol.DataPart)
		if !ok || dp.Data == nil {
			continue
		}
		data, err := json.Marshal(dp.Data)
		if err != nil {
			continue
		}
		var payload ToolRequestPayloadV1
		if err := json.Unmarshal(data, &payload); err != nil {
			continue
		}
		if payload.Schema == A2APayloadSchemaToolRequestV1 {
			return &payload
		}
	}
	return nil
}

func buildToolResultV2Message(results []ToolResultEntryV2) protocol.Message {
	payload := ToolResultPayloadV2{
		Schema:  A2APayloadSchemaToolRequestV1,
		Results: results,
	}
	return protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		&protocol.DataPart{
			Kind: protocol.KindData,
			Data: payload,
		},
	})
}

type HistoryPayloadV1 struct {
	Schema    string             `json:"schema"`
	Strategy  string             `json:"strategy"`
	Messages  []protocol.Message `json:"messages,omitempty"`
	Truncated bool               `json:"truncated"`
	MaxWindow int                `json:"maxWindow,omitempty"`
	MemoryRef string             `json:"memoryRef,omitempty"`
}

type UserInputRequestPayloadV1 struct {
	Schema    string   `json:"schema"`
	Prompt    string   `json:"prompt"`
	InputType string   `json:"inputType"`
	Options   []string `json:"options,omitempty"`
	Timeout   int      `json:"timeout,omitempty"`
}

type UserInputResponsePayloadV1 struct {
	Schema    string `json:"schema"`
	Value     string `json:"value"`
	Cancelled bool   `json:"cancelled"`
}

type AuthCallbackPayloadV1 struct {
	Schema    string   `json:"schema"`
	Reason    string   `json:"reason"`
	Provider  string   `json:"provider"`
	Scopes    []string `json:"scopes,omitempty"`
	ExpiresAt string   `json:"expiresAt,omitempty"`
}

func parseUserInputRequestPayload(msg *protocol.Message) *UserInputRequestPayloadV1 {
	if msg == nil {
		return nil
	}
	for _, part := range msg.Parts {
		dp, ok := part.(*protocol.DataPart)
		if !ok || dp.Data == nil {
			continue
		}
		data, err := json.Marshal(dp.Data)
		if err != nil {
			continue
		}
		var payload UserInputRequestPayloadV1
		if err := json.Unmarshal(data, &payload); err != nil {
			continue
		}
		if payload.Schema == A2APayloadSchemaUserInputRequestV1 {
			return &payload
		}
	}
	return nil
}

func parseAuthCallbackPayload(msg *protocol.Message) *AuthCallbackPayloadV1 {
	if msg == nil {
		return nil
	}
	for _, part := range msg.Parts {
		dp, ok := part.(*protocol.DataPart)
		if !ok || dp.Data == nil {
			continue
		}
		data, err := json.Marshal(dp.Data)
		if err != nil {
			continue
		}
		var payload AuthCallbackPayloadV1
		if err := json.Unmarshal(data, &payload); err != nil {
			continue
		}
		if payload.Schema == A2APayloadSchemaAuthCallbackV1 {
			return &payload
		}
	}
	return nil
}
