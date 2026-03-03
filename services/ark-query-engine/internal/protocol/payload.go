package protocol

const (
	PayloadSchemaToolRequestV1 = "https://ark.mckinsey.com/payloads/tool-request/v1"
	PayloadSchemaToolResultV1  = "https://ark.mckinsey.com/payloads/tool-result/v1"
	PayloadSchemaRoleHintV1    = "https://ark.mckinsey.com/payloads/role-hint/v1"

	ExecutionProfileSchemaV1 = "https://ark.mckinsey.com/extensions/execution-profile/v1"

	PayloadSchemaHistoryV1            = "https://ark.mckinsey.com/payloads/history/v1"
	PayloadSchemaUserInputRequestV1   = "https://ark.mckinsey.com/payloads/user-input-request/v1"
	PayloadSchemaUserInputResponseV1  = "https://ark.mckinsey.com/payloads/user-input-response/v1"
	PayloadSchemaAuthCallbackV1       = "https://ark.mckinsey.com/payloads/auth-callback/v1"
)

type ToolRequestPayloadV1 struct {
	Schema string            `json:"schema"`
	Calls  []ToolRequestCall `json:"calls"`
}

type ToolRequestCall struct {
	ToolCallID string `json:"toolCallId"`
	ToolName   string `json:"toolName"`
	Arguments  string `json:"arguments"`
}

type ToolResultPayloadV1 struct {
	Schema  string            `json:"schema"`
	Results []ToolResultEntry `json:"results"`
}

type ToolResultEntry struct {
	ToolCallID string `json:"toolCallId"`
	ToolName   string `json:"toolName"`
	Content    string `json:"content"`
	Error      string `json:"error,omitempty"`
}

type RoleHintPayloadV1 struct {
	Schema string `json:"schema"`
	Role   string `json:"role"`
}

type HistoryPayloadV1 struct {
	Schema    string `json:"schema"`
	Strategy  string `json:"strategy"`
	Truncated bool   `json:"truncated"`
	MaxWindow int    `json:"maxWindow,omitempty"`
	MemoryRef string `json:"memoryRef,omitempty"`
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
