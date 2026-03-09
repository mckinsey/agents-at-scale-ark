package genai

import (
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	arkann "mckinsey.com/ark/internal/annotations"
)

func TestExtractTextFromTask(t *testing.T) {
	tests := []struct {
		name        string
		task        *protocol.Task
		expected    string
		expectError bool
		errorMsg    string
	}{
		{
			name: "completed task with single agent message",
			task: &protocol.Task{
				ID: "task-1",
				Status: protocol.TaskStatus{
					State: TaskStateCompleted,
				},
				History: []protocol.Message{
					{
						Role: protocol.MessageRoleAgent,
						Parts: []protocol.Part{
							protocol.TextPart{Text: "Task completed successfully"},
						},
					},
				},
			},
			expected:    "Task completed successfully",
			expectError: false,
		},
		{
			name: "completed task with multiple agent messages",
			task: &protocol.Task{
				ID: "task-2",
				Status: protocol.TaskStatus{
					State: TaskStateCompleted,
				},
				History: []protocol.Message{
					{
						Role: protocol.MessageRoleAgent,
						Parts: []protocol.Part{
							protocol.TextPart{Text: "Starting countdown from 2 seconds..."},
						},
					},
					{
						Role: protocol.MessageRoleAgent,
						Parts: []protocol.Part{
							protocol.TextPart{Text: "1 seconds remaining..."},
						},
					},
					{
						Role: protocol.MessageRoleAgent,
						Parts: []protocol.Part{
							protocol.TextPart{Text: "0 seconds remaining..."},
						},
					},
					{
						Role: protocol.MessageRoleAgent,
						Parts: []protocol.Part{
							protocol.TextPart{Text: "Countdown complete!"},
						},
					},
				},
			},
			expected:    "Starting countdown from 2 seconds...\n1 seconds remaining...\n0 seconds remaining...\nCountdown complete!",
			expectError: false,
		},
		{
			name: "completed task with user and agent messages",
			task: &protocol.Task{
				ID: "task-3",
				Status: protocol.TaskStatus{
					State: TaskStateCompleted,
				},
				History: []protocol.Message{
					{
						Role: protocol.MessageRoleUser,
						Parts: []protocol.Part{
							protocol.TextPart{Text: "User message"},
						},
					},
					{
						Role: protocol.MessageRoleAgent,
						Parts: []protocol.Part{
							protocol.TextPart{Text: "Agent response"},
						},
					},
				},
			},
			expected:    "Agent response",
			expectError: false,
		},
		{
			name: "failed task with error message",
			task: &protocol.Task{
				ID: "task-4",
				Status: protocol.TaskStatus{
					State: TaskStateFailed,
					Message: &protocol.Message{
						Parts: []protocol.Part{
							protocol.TextPart{Text: "Cannot countdown from negative number -1"},
						},
					},
				},
			},
			expected:    "",
			expectError: true,
			errorMsg:    "Cannot countdown from negative number -1",
		},
		{
			name: "failed task without error message",
			task: &protocol.Task{
				ID: "task-5",
				Status: protocol.TaskStatus{
					State: TaskStateFailed,
				},
			},
			expected:    "",
			expectError: true,
			errorMsg:    "task failed",
		},
		{
			name: "task with no state",
			task: &protocol.Task{
				ID: "task-6",
				Status: protocol.TaskStatus{
					State: "",
				},
			},
			expected:    "",
			expectError: true,
			errorMsg:    "task has no status state",
		},
		{
			name: "task in unexpected state",
			task: &protocol.Task{
				ID: "task-7",
				Status: protocol.TaskStatus{
					State: TaskStateWorking,
				},
			},
			expected:    "",
			expectError: true,
			errorMsg:    "task in state 'working' (expected completed or failed)",
		},
		{
			name: "completed task with empty history",
			task: &protocol.Task{
				ID: "task-8",
				Status: protocol.TaskStatus{
					State: TaskStateCompleted,
				},
				History: []protocol.Message{},
			},
			expected:    "",
			expectError: false,
		},
		{
			name: "completed task with agent messages containing multiple parts",
			task: &protocol.Task{
				ID: "task-9",
				Status: protocol.TaskStatus{
					State: TaskStateCompleted,
				},
				History: []protocol.Message{
					{
						Role: protocol.MessageRoleAgent,
						Parts: []protocol.Part{
							protocol.TextPart{Text: "Part 1 "},
							protocol.TextPart{Text: "Part 2"},
						},
					},
				},
			},
			expected:    "Part 1 Part 2",
			expectError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := extractTextFromTask(tt.task)

			if tt.expectError {
				assert.Error(t, err)
				assert.Contains(t, err.Error(), tt.errorMsg)
				assert.Equal(t, tt.expected, result)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.expected, result)
			}
		})
	}
}

func TestExtractTextFromParts(t *testing.T) {
	tests := []struct {
		name     string
		parts    []protocol.Part
		expected string
	}{
		{
			name: "single text part",
			parts: []protocol.Part{
				protocol.TextPart{Text: "Hello world"},
			},
			expected: "Hello world",
		},
		{
			name: "multiple text parts",
			parts: []protocol.Part{
				protocol.TextPart{Text: "Hello "},
				protocol.TextPart{Text: "world"},
			},
			expected: "Hello world",
		},
		{
			name: "text part pointer",
			parts: []protocol.Part{
				&protocol.TextPart{Text: "Pointer text"},
			},
			expected: "Pointer text",
		},
		{
			name:     "empty parts",
			parts:    []protocol.Part{},
			expected: "",
		},
		{
			name: "mixed text parts and pointers",
			parts: []protocol.Part{
				protocol.TextPart{Text: "Part 1 "},
				&protocol.TextPart{Text: "Part 2"},
			},
			expected: "Part 1 Part 2",
		},
		{
			name: "data and file parts",
			parts: []protocol.Part{
				&protocol.DataPart{
					Data: map[string]any{"key": "value"},
				},
				&protocol.FilePart{
					File: &protocol.FileWithURI{URI: "https://example.com/result.txt"},
				},
			},
			expected: "https://example.com/result.txt",
		},
		{
			name: "file bytes part",
			parts: []protocol.Part{
				&protocol.FilePart{
					File: &protocol.FileWithBytes{Bytes: "YWJj"},
				},
			},
			expected: "file-bytes",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := extractTextFromParts(tt.parts)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestBuildA2AMetadataWithHistory(t *testing.T) {
	annotations := map[string]string{
		arkann.A2AHistoryEnabled:      TrueString,
		arkann.A2AHistoryLimit:        "1",
		arkann.A2ASupportedExtensions: `["https://ark.mckinsey.com/extensions/history/v1"]`,
	}
	first, err := OpenAIToA2AMessage(NewUserMessage("first"))
	assert.NoError(t, err)
	second, err := OpenAIToA2AMessage(NewAssistantMessage("second"))
	assert.NoError(t, err)
	history := []protocol.Message{first, second}

	metadata, err := buildA2AMetadata(annotations, history, true)

	assert.NoError(t, err)
	assert.NotNil(t, metadata)
	rawHistory, ok := metadata[a2aHistoryExtensionKey]
	assert.True(t, ok)
	historyExt, ok := rawHistory.(HistoryExtensionV1)
	assert.True(t, ok)
	assert.Len(t, historyExt.Messages, 1)
	assert.Equal(t, protocol.MessageRoleAgent, historyExt.Messages[0].Role)
	assert.True(t, historyExt.Truncated, "should be truncated because limit=1 and history had 2 items")
	assert.Equal(t, 1, historyExt.MaxWindow)
}

func TestBuildA2AMetadataWithHistoryWithoutDeclaredSupportedExtensions(t *testing.T) {
	annotations := map[string]string{
		arkann.A2AHistoryEnabled: TrueString,
	}
	first, err := OpenAIToA2AMessage(NewUserMessage("first"))
	assert.NoError(t, err)
	second, err := OpenAIToA2AMessage(NewAssistantMessage("second"))
	assert.NoError(t, err)
	history := []protocol.Message{first, second}

	metadata, err := buildA2AMetadata(annotations, history, true)

	assert.NoError(t, err)
	assert.NotNil(t, metadata)
	rawHistory, ok := metadata[a2aHistoryExtensionKey]
	assert.True(t, ok)
	historyExt, ok := rawHistory.(HistoryExtensionV1)
	assert.True(t, ok)
	assert.Len(t, historyExt.Messages, 2)
	assert.False(t, historyExt.Truncated)
}

func TestBuildA2AMetadataPermissions(t *testing.T) {
	permissions := `{"subject":"user-123","scopes":["agents:read"]}`
	annotations := map[string]string{
		arkann.A2APermissions:         permissions,
		arkann.A2ASupportedExtensions: `["https://ark.mckinsey.com/extensions/permissions/v1"]`,
	}

	metadata, err := buildA2AMetadata(annotations, nil, false)

	assert.NoError(t, err)
	assert.NotNil(t, metadata)
	permissionsValue, ok := metadata[a2aPermissionsExtensionKey]
	assert.True(t, ok)
	permissionsMap, ok := permissionsValue.(map[string]interface{})
	assert.True(t, ok)
	assert.Equal(t, "user-123", permissionsMap["subject"])
}

func TestBuildA2AMetadataPermissionsUnsupported(t *testing.T) {
	permissions := `{"subject":"user-123","scopes":["agents:read"]}`
	annotations := map[string]string{
		arkann.A2APermissions: permissions,
	}

	metadata, err := buildA2AMetadata(annotations, nil, false)

	assert.NoError(t, err)
	if metadata != nil {
		_, ok := metadata[a2aPermissionsExtensionKey]
		assert.False(t, ok)
	}
}

func TestBuildA2AMetadataPermissionsInvalid(t *testing.T) {
	permissions := `{"scopes":["agents:read"]}`
	annotations := map[string]string{
		arkann.A2APermissions:         permissions,
		arkann.A2ASupportedExtensions: `["https://ark.mckinsey.com/extensions/permissions/v1"]`,
	}

	_, err := buildA2AMetadata(annotations, nil, false)

	assert.Error(t, err)
}

func TestExtractA2AExtensionsHeaderFromRequestBody(t *testing.T) {
	body := `{"jsonrpc":"2.0","id":"1","method":"message/send","params":{"message":{"extensions":["https://example.com/ext/b/v1","https://example.com/ext/a/v1"]}}}`
	req, err := http.NewRequest(http.MethodPost, "http://example.com/rpc", strings.NewReader(body))
	assert.NoError(t, err)
	req.Header.Set(a2aExtensionsHeader, "https://example.com/ext/base/v1")

	headerValue := extractA2AExtensionsHeader(req)
	assert.Equal(t, "https://example.com/ext/a/v1, https://example.com/ext/b/v1, https://example.com/ext/base/v1", headerValue)

	restoredBody, readErr := io.ReadAll(req.Body)
	assert.NoError(t, readErr)
	assert.Equal(t, body, string(restoredBody))
}

func TestExtractA2AExtensionsHeaderWithoutExtensions(t *testing.T) {
	body := `{"jsonrpc":"2.0","id":"1","method":"message/send","params":{"message":{}}}`
	req, err := http.NewRequest(http.MethodPost, "http://example.com/rpc", strings.NewReader(body))
	assert.NoError(t, err)
	req.Header.Set(a2aExtensionsHeader, "https://example.com/ext/base/v1")

	headerValue := extractA2AExtensionsHeader(req)
	assert.Equal(t, "https://example.com/ext/base/v1", headerValue)
}

func TestBuildA2ASendMessageParamsAssignsMessageIDWhenMissing(t *testing.T) {
	userInput := protocol.Message{
		Role: protocol.MessageRoleUser,
		Parts: []protocol.Part{
			protocol.NewTextPart("hello"),
		},
	}

	params := buildA2ASendMessageParams(userInput, "ctx-123", nil, false)

	assert.NotEmpty(t, params.Message.MessageID)
	assert.Equal(t, protocol.MessageRoleUser, params.Message.Role)
	if assert.NotNil(t, params.Message.ContextID) {
		assert.Equal(t, "ctx-123", *params.Message.ContextID)
	}
}

func TestBuildA2ASendMessageParamsPreservesExistingMessageID(t *testing.T) {
	userInput := protocol.Message{
		MessageID: "msg-existing",
		Role:      protocol.MessageRoleUser,
		Parts: []protocol.Part{
			protocol.NewTextPart("hello"),
		},
	}

	params := buildA2ASendMessageParams(userInput, "", nil, true)

	assert.Equal(t, "msg-existing", params.Message.MessageID)
}

func TestBuildA2ASendMessageParamsPreservesNonURIMetadataWithoutRejecting(t *testing.T) {
	userInput := protocol.Message{
		Role: protocol.MessageRoleUser,
		Parts: []protocol.Part{
			protocol.NewTextPart("hello"),
		},
	}

	params := buildA2ASendMessageParams(userInput, "", map[string]interface{}{
		"ark.mckinsey.com/tool-call-id": "call-1",
	}, true)

	if assert.NotNil(t, params.Metadata) {
		assert.Equal(t, "call-1", params.Metadata["ark.mckinsey.com/tool-call-id"])
	}
	assert.Empty(t, params.Message.Extensions)
}

func TestBuildA2ASendMessageParamsMergesURIExtensionsAndPreservesMetadata(t *testing.T) {
	userInput := protocol.Message{
		Role: protocol.MessageRoleUser,
		Parts: []protocol.Part{
			protocol.NewTextPart("hello"),
		},
		Extensions: []string{
			"https://example.com/ext/base/v1",
		},
	}

	params := buildA2ASendMessageParams(userInput, "", map[string]interface{}{
		"https://example.com/ext/custom/v1": map[string]interface{}{
			"enabled": true,
		},
		"ark.mckinsey.com/tool-call-id": "call-1",
	}, true)

	if assert.NotNil(t, params.Metadata) {
		assert.Equal(t, "call-1", params.Metadata["ark.mckinsey.com/tool-call-id"])
		_, hasCustomExtension := params.Metadata["https://example.com/ext/custom/v1"]
		assert.True(t, hasCustomExtension)
	}
	assert.ElementsMatch(t, []string{
		"https://example.com/ext/base/v1",
		"https://example.com/ext/custom/v1",
	}, params.Message.Extensions)
}

func TestAppendDelegationHop(t *testing.T) {
	perms := &A2APermissions{Subject: "user-123"}
	AppendDelegationHop(perms, "agent-a", "default", "delegate")

	require.NotNil(t, perms.Delegation)
	assert.Equal(t, "user-123", perms.Delegation.Subject)
	require.Len(t, perms.Delegation.Chain, 1)
	assert.Equal(t, "agent-a", perms.Delegation.Chain[0].Agent)
	assert.Equal(t, "default", perms.Delegation.Chain[0].Namespace)
	assert.Equal(t, "delegate", perms.Delegation.Chain[0].Action)
	assert.NotEmpty(t, perms.Delegation.Chain[0].Timestamp)

	AppendDelegationHop(perms, "agent-b", "prod", "execute")
	require.Len(t, perms.Delegation.Chain, 2)
	assert.Equal(t, "agent-b", perms.Delegation.Chain[1].Agent)
}

func TestAppendDelegationHopNilPermissions(t *testing.T) {
	AppendDelegationHop(nil, "agent-a", "default", "delegate")
}

func TestValidateTokenTypeJWT(t *testing.T) {
	perms := A2APermissions{Subject: "user", Token: "eyJ...", TokenType: TokenTypeJWT}
	assert.NoError(t, ValidateTokenType(perms))
}

func TestValidateTokenTypeJWS(t *testing.T) {
	perms := A2APermissions{Subject: "user", Token: "eyJ...", TokenType: TokenTypeJWS}
	assert.NoError(t, ValidateTokenType(perms))
}

func TestValidateTokenTypeBearer(t *testing.T) {
	perms := A2APermissions{Subject: "user", Token: "abc", TokenType: "bearer"}
	assert.NoError(t, ValidateTokenType(perms))
}

func TestValidateTokenTypeUnsupported(t *testing.T) {
	perms := A2APermissions{Subject: "user", Token: "abc", TokenType: "custom"}
	err := ValidateTokenType(perms)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "unsupported tokenType")
}

func TestValidateTokenTypeMissingWhenTokenPresent(t *testing.T) {
	perms := A2APermissions{Subject: "user", Token: "abc", TokenType: ""}
	err := ValidateTokenType(perms)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "tokenType is required")
}

func TestValidateTokenTypeNoToken(t *testing.T) {
	perms := A2APermissions{Subject: "user"}
	assert.NoError(t, ValidateTokenType(perms))
}

func TestIsA2AExtensionAllowedNilSupportUsesPolicy(t *testing.T) {
	assert.True(t, isA2AExtensionAllowed(a2aHistoryExtensionKey, nil), "history should be allowed by default")
	assert.False(t, isA2AExtensionAllowed(a2aPermissionsExtensionKey, nil), "permissions should be denied by default")
}

func TestIsA2AExtensionAllowedUnknownURIDeniedByDefault(t *testing.T) {
	assert.False(t, isA2AExtensionAllowed("https://example.com/extensions/custom/v1", nil))
}

func TestIsA2AExtensionAllowedStrictWhenDeclared(t *testing.T) {
	supported := map[string]struct{}{
		a2aPermissionsExtensionKey: {},
	}
	assert.True(t, isA2AExtensionAllowed(a2aPermissionsExtensionKey, supported))
	assert.False(t, isA2AExtensionAllowed(a2aHistoryExtensionKey, supported), "history should be denied when not in declared set")
}

func TestIsA2AExtensionAllowedEmptyString(t *testing.T) {
	assert.False(t, isA2AExtensionAllowed("", nil))
	supported := map[string]struct{}{a2aHistoryExtensionKey: {}}
	assert.False(t, isA2AExtensionAllowed("", supported))
}

func TestIsA2AExtensionAllowedCustomURIInDeclaredSet(t *testing.T) {
	customURI := "https://example.com/extensions/future/v1"
	supported := map[string]struct{}{
		a2aHistoryExtensionKey: {},
		customURI:              {},
	}
	assert.True(t, isA2AExtensionAllowed(customURI, supported))
	assert.True(t, isA2AExtensionAllowed(a2aHistoryExtensionKey, supported))
	assert.False(t, isA2AExtensionAllowed(a2aPermissionsExtensionKey, supported))
}

func TestGetA2ASupportedExtensionsMalformedJSON(t *testing.T) {
	ann := map[string]string{
		arkann.A2ASupportedExtensions: `not-json`,
	}
	result := getA2ASupportedExtensions(ann)
	assert.Nil(t, result)
}

func TestGetA2ASupportedExtensionsEmptyArray(t *testing.T) {
	ann := map[string]string{
		arkann.A2ASupportedExtensions: `[]`,
	}
	result := getA2ASupportedExtensions(ann)
	assert.Nil(t, result)
}

func TestGetA2ASupportedExtensionsBlankEntries(t *testing.T) {
	ann := map[string]string{
		arkann.A2ASupportedExtensions: `["", " ", "https://ark.mckinsey.com/extensions/history/v1"]`,
	}
	result := getA2ASupportedExtensions(ann)
	require.Len(t, result, 1)
	_, ok := result[a2aHistoryExtensionKey]
	assert.True(t, ok)
}

func TestFilterUnsupportedA2AExtensionsGeneric(t *testing.T) {
	metadata := map[string]interface{}{
		a2aHistoryExtensionKey:     map[string]interface{}{"messages": []interface{}{}},
		a2aPermissionsExtensionKey: map[string]interface{}{"subject": "user-1"},
		"non-uri-key":              "kept",
	}
	supported := map[string]struct{}{
		a2aHistoryExtensionKey: {},
	}
	result := filterUnsupportedA2AExtensions(metadata, supported)
	assert.Contains(t, result, a2aHistoryExtensionKey)
	assert.NotContains(t, result, a2aPermissionsExtensionKey)
	assert.Contains(t, result, "non-uri-key")
}

func TestFilterUnsupportedA2AExtensionsNilSupported(t *testing.T) {
	metadata := map[string]interface{}{
		a2aHistoryExtensionKey:     map[string]interface{}{"messages": []interface{}{}},
		a2aPermissionsExtensionKey: map[string]interface{}{"subject": "user-1"},
	}
	result := filterUnsupportedA2AExtensions(metadata, nil)
	assert.Contains(t, result, a2aHistoryExtensionKey, "history allowed by default")
	assert.NotContains(t, result, a2aPermissionsExtensionKey, "permissions denied by default")
}

func TestFilterUnsupportedA2AExtensionsNilMetadata(t *testing.T) {
	assert.Nil(t, filterUnsupportedA2AExtensions(nil, nil))
}

func TestBuildA2AMetadataHistoryExplicitlyDisabledByDeclaration(t *testing.T) {
	ann := map[string]string{
		arkann.A2AHistoryEnabled:      TrueString,
		arkann.A2ASupportedExtensions: `["https://ark.mckinsey.com/extensions/permissions/v1"]`,
	}
	msg, _ := OpenAIToA2AMessage(NewUserMessage("hello"))
	metadata, err := buildA2AMetadata(ann, []protocol.Message{msg}, true)
	assert.NoError(t, err)
	if metadata != nil {
		_, ok := metadata[a2aHistoryExtensionKey]
		assert.False(t, ok, "history must be excluded when not in declared extensions")
	}
}

func TestBuildA2AMetadataBothExtensionsDeclared(t *testing.T) {
	permissions := `{"subject":"user-1","scopes":["read"]}`
	ann := map[string]string{
		arkann.A2AHistoryEnabled:      TrueString,
		arkann.A2APermissions:         permissions,
		arkann.A2ASupportedExtensions: `["https://ark.mckinsey.com/extensions/history/v1","https://ark.mckinsey.com/extensions/permissions/v1"]`,
	}
	msg, _ := OpenAIToA2AMessage(NewUserMessage("hello"))
	metadata, err := buildA2AMetadata(ann, []protocol.Message{msg}, true)
	assert.NoError(t, err)
	require.NotNil(t, metadata)
	_, hasHistory := metadata[a2aHistoryExtensionKey]
	assert.True(t, hasHistory)
	_, hasPerms := metadata[a2aPermissionsExtensionKey]
	assert.True(t, hasPerms)
}

func TestFutureExtensionPolicyRegistration(t *testing.T) {
	futureURI := "https://ark.mckinsey.com/extensions/audit/v1"

	originalPolicies := make([]a2aExtensionPolicy, len(a2aExtensionPolicies))
	copy(originalPolicies, a2aExtensionPolicies)
	defer func() { a2aExtensionPolicies = originalPolicies }()

	a2aExtensionPolicies = append(a2aExtensionPolicies, a2aExtensionPolicy{
		URI:              futureURI,
		AllowedByDefault: true,
	})

	assert.True(t, isA2AExtensionAllowed(futureURI, nil), "future extension with AllowedByDefault=true should be allowed when undeclared")
	assert.True(t, isA2AExtensionAllowed(a2aHistoryExtensionKey, nil), "existing policies unaffected")
	assert.False(t, isA2AExtensionAllowed(a2aPermissionsExtensionKey, nil), "existing policies unaffected")

	declared := map[string]struct{}{
		a2aHistoryExtensionKey: {},
	}
	assert.False(t, isA2AExtensionAllowed(futureURI, declared), "future extension not in declared set should be denied")
}
