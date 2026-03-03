package genai

type A2ADelegatedToolExtension struct {
	ToolCallID         string            `json:"toolCallId,omitempty"`
	ToolName           string            `json:"toolName,omitempty"`
	StepID             string            `json:"stepId,omitempty"`
	ParentStepID       string            `json:"parentStepId,omitempty"`
	DelegatedTaskID    string            `json:"delegatedTaskId,omitempty"`
	DelegatedContextID string            `json:"delegatedContextId,omitempty"`
	Sequence           *int              `json:"sequence,omitempty"`
	InvocationArgs     map[string]string `json:"invocationArgs,omitempty"`
}
