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
