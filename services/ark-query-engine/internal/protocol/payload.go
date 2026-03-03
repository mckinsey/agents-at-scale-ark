package protocol

const (
	PayloadSchemaToolRequestV1 = "https://ark.mckinsey.com/payloads/tool-request/v1"
	PayloadSchemaToolResultV1  = "https://ark.mckinsey.com/payloads/tool-result/v1"
	PayloadSchemaRoleHintV1    = "https://ark.mckinsey.com/payloads/role-hint/v1"
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
