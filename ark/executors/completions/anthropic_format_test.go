package completions

import (
	"encoding/json"
	"testing"

	"github.com/openai/openai-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestConvertMessagesToAnthropic(t *testing.T) {
	t.Run("extracts system prompt as cached block", func(t *testing.T) {
		messages := []Message{
			NewSystemMessage("You are helpful"),
			NewUserMessage("Hello"),
		}
		result, systemBlocks := convertMessagesToAnthropic(messages, nil)
		require.Len(t, systemBlocks, 1)
		assert.Equal(t, "text", systemBlocks[0].Type)
		assert.Equal(t, "You are helpful", systemBlocks[0].Text)
		require.NotNil(t, systemBlocks[0].CacheControl)
		assert.Equal(t, "ephemeral", systemBlocks[0].CacheControl.Type)
		require.Len(t, result, 1)
		assert.Equal(t, "user", result[0].Role)
		assert.Equal(t, json.RawMessage(`"Hello"`), result[0].Content)
	})

	t.Run("converts user and assistant messages", func(t *testing.T) {
		messages := []Message{
			NewUserMessage("Hi"),
			NewAssistantMessage("Hello!"),
			NewUserMessage("How are you?"),
		}
		result, systemBlocks := convertMessagesToAnthropic(messages, nil)
		assert.Empty(t, systemBlocks)
		require.Len(t, result, 3)
		assert.Equal(t, "user", result[0].Role)
		assert.Equal(t, "assistant", result[1].Role)
		assert.Equal(t, "user", result[2].Role)
	})

	t.Run("marks penultimate message with cache_control", func(t *testing.T) {
		messages := []Message{
			NewUserMessage("Hi"),
			NewAssistantMessage("Hello!"),
			NewUserMessage("How are you?"),
		}
		result, _ := convertMessagesToAnthropic(messages, nil)
		require.Len(t, result, 3)

		var blocks []anthropicMessageContent
		require.NoError(t, json.Unmarshal(result[1].Content, &blocks))
		require.Len(t, blocks, 1)
		assert.Equal(t, "Hello!", blocks[0].Text)
		require.NotNil(t, blocks[0].CacheControl)
		assert.Equal(t, "ephemeral", blocks[0].CacheControl.Type)

		assert.Equal(t, json.RawMessage(`"How are you?"`), result[2].Content)
	})

	t.Run("no cache breakpoint with single message", func(t *testing.T) {
		messages := []Message{NewUserMessage("only one")}
		result, _ := convertMessagesToAnthropic(messages, nil)
		require.Len(t, result, 1)
		assert.Equal(t, json.RawMessage(`"only one"`), result[0].Content)
	})

	t.Run("skips empty messages", func(t *testing.T) {
		messages := []Message{
			NewUserMessage(""),
			NewUserMessage("hello"),
		}
		result, _ := convertMessagesToAnthropic(messages, nil)
		require.Len(t, result, 1)
		assert.Equal(t, json.RawMessage(`"hello"`), result[0].Content)
	})
}

func TestConvertAnthropicResponse(t *testing.T) {
	t.Run("converts text response", func(t *testing.T) {
		response := anthropicResponse{
			ID:         "msg_123",
			Model:      "claude-sonnet-4-20250514",
			StopReason: "end_turn",
			Content: []anthropicContent{
				{Type: "text", Text: "Hello!"},
			},
			Usage: struct {
				InputTokens              int `json:"input_tokens"`
				OutputTokens             int `json:"output_tokens"`
				CacheCreationInputTokens int `json:"cache_creation_input_tokens"`
				CacheReadInputTokens     int `json:"cache_read_input_tokens"`
			}{InputTokens: 10, OutputTokens: 5},
		}

		result := convertAnthropicResponse(response)
		assert.Equal(t, "msg_123", result.ID)
		assert.Contains(t, result.Object, "chat.completion")
		require.Len(t, result.Choices, 1)
		assert.Equal(t, "Hello!", result.Choices[0].Message.Content)
		assert.Contains(t, result.Choices[0].FinishReason, "stop")
		assert.Equal(t, int64(10), result.Usage.PromptTokens)
		assert.Equal(t, int64(5), result.Usage.CompletionTokens)
		assert.Equal(t, int64(15), result.Usage.TotalTokens)
	})

	t.Run("folds cache tokens into prompt and total", func(t *testing.T) {
		response := anthropicResponse{
			ID:         "msg_cache",
			StopReason: "end_turn",
			Content:    []anthropicContent{{Type: "text", Text: "Hi"}},
			Usage: struct {
				InputTokens              int `json:"input_tokens"`
				OutputTokens             int `json:"output_tokens"`
				CacheCreationInputTokens int `json:"cache_creation_input_tokens"`
				CacheReadInputTokens     int `json:"cache_read_input_tokens"`
			}{InputTokens: 10, OutputTokens: 5, CacheCreationInputTokens: 100, CacheReadInputTokens: 200},
		}

		result := convertAnthropicResponse(response)
		assert.Equal(t, int64(310), result.Usage.PromptTokens)
		assert.Equal(t, int64(5), result.Usage.CompletionTokens)
		assert.Equal(t, int64(315), result.Usage.TotalTokens)
		assert.Equal(t, int64(200), result.Usage.PromptTokensDetails.CachedTokens)
	})

	t.Run("converts tool_use response", func(t *testing.T) {
		response := anthropicResponse{
			ID:         "msg_456",
			Model:      "claude-sonnet-4-20250514",
			StopReason: "tool_use",
			Content: []anthropicContent{
				{Type: "text", Text: "Let me search for that."},
				{Type: "tool_use", ID: "call_1", Name: "search", Input: map[string]interface{}{"query": "test"}},
			},
		}

		result := convertAnthropicResponse(response)
		assert.Contains(t, result.Choices[0].FinishReason, "tool_calls")
		assert.Equal(t, "Let me search for that.", result.Choices[0].Message.Content)
		require.Len(t, result.Choices[0].Message.ToolCalls, 1)
		assert.Equal(t, "call_1", result.Choices[0].Message.ToolCalls[0].ID)
		assert.Equal(t, "search", result.Choices[0].Message.ToolCalls[0].Function.Name)
		assert.Contains(t, result.Choices[0].Message.ToolCalls[0].Type, "function")
	})

	t.Run("maps max_tokens to length", func(t *testing.T) {
		response := anthropicResponse{
			StopReason: "max_tokens",
			Content:    []anthropicContent{{Type: "text", Text: "truncated"}},
		}
		result := convertAnthropicResponse(response)
		assert.Contains(t, result.Choices[0].FinishReason, "length")
	})
}

func TestConvertToolsToAnthropic(t *testing.T) {
	t.Run("converts function tools", func(t *testing.T) {
		tools := []openai.ChatCompletionToolParam{
			{
				Type: "function",
				Function: openai.FunctionDefinitionParam{
					Name:        "search",
					Description: openai.String("Search the web"),
					Parameters:  map[string]interface{}{"type": "object", "properties": map[string]interface{}{"query": map[string]interface{}{"type": "string"}}},
				},
			},
		}

		result := convertToolsToAnthropic(tools)
		require.Len(t, result, 1)
		assert.Equal(t, "search", result[0].Name)
		assert.Equal(t, "Search the web", result[0].Description)
		assert.NotNil(t, result[0].InputSchema)
	})

	t.Run("marks last tool with cache_control", func(t *testing.T) {
		tools := []openai.ChatCompletionToolParam{
			{Type: "function", Function: openai.FunctionDefinitionParam{Name: "first"}},
			{Type: "function", Function: openai.FunctionDefinitionParam{Name: "last"}},
		}
		result := convertToolsToAnthropic(tools)
		require.Len(t, result, 2)
		assert.Nil(t, result[0].CacheControl)
		require.NotNil(t, result[1].CacheControl)
		assert.Equal(t, "ephemeral", result[1].CacheControl.Type)
	})

	t.Run("no panic on nil tools", func(t *testing.T) {
		result := convertToolsToAnthropic(nil)
		assert.Empty(t, result)
	})

	t.Run("skips non-function tools", func(t *testing.T) {
		tools := []openai.ChatCompletionToolParam{
			{Type: "other"},
		}
		result := convertToolsToAnthropic(tools)
		assert.Empty(t, result)
	})
}

func TestBuildAnthropicRequest(t *testing.T) {
	messages := []anthropicMessage{{Role: "user", Content: json.RawMessage(`"Hi"`)}}
	tools := []anthropicTool{{Name: "test", Description: "test tool"}}
	system := []anthropicSystemBlock{{Type: "text", Text: "system"}}

	t.Run("uses defaults", func(t *testing.T) {
		req := buildAnthropicRequest(messages, system, tools, ToolChoiceUnset, nil)
		assert.Equal(t, 4096, req.MaxTokens)
		assert.Equal(t, 1.0, req.Temperature)
		require.Len(t, req.SystemPrompt, 1)
		assert.Equal(t, "system", req.SystemPrompt[0].Text)
		assert.Len(t, req.Messages, 1)
		assert.Len(t, req.Tools, 1)
		assert.Nil(t, req.ToolChoice)
	})

	t.Run("uses properties", func(t *testing.T) {
		props := map[string]string{"temperature": "0.5", "max_tokens": "1024"}
		req := buildAnthropicRequest(messages, nil, tools, ToolChoiceUnset, props)
		assert.Equal(t, 1024, req.MaxTokens)
		assert.Equal(t, 0.5, req.Temperature)
	})

	t.Run("required tool choice maps to type=any", func(t *testing.T) {
		req := buildAnthropicRequest(messages, nil, tools, ToolChoiceRequired, nil)
		assert.Equal(t, map[string]interface{}{"type": "any"}, req.ToolChoice)
	})

	t.Run("auto and none tool choice map through", func(t *testing.T) {
		auto := buildAnthropicRequest(messages, nil, tools, ToolChoiceAuto, nil)
		assert.Equal(t, map[string]interface{}{"type": "auto"}, auto.ToolChoice)
		none := buildAnthropicRequest(messages, nil, tools, ToolChoiceNone, nil)
		assert.Equal(t, map[string]interface{}{"type": "none"}, none.ToolChoice)
	})

	t.Run("tool_choice is omitted from JSON when unset", func(t *testing.T) {
		req := buildAnthropicRequest(messages, nil, tools, ToolChoiceUnset, nil)
		body, err := json.Marshal(req)
		require.NoError(t, err)
		assert.NotContains(t, string(body), "tool_choice")
	})

	t.Run("tool_choice is serialized when set", func(t *testing.T) {
		req := buildAnthropicRequest(messages, nil, tools, ToolChoiceRequired, nil)
		body, err := json.Marshal(req)
		require.NoError(t, err)
		assert.Contains(t, string(body), `"tool_choice":{"type":"any"}`)
	})
}

func TestExtractMessageContent(t *testing.T) {
	t.Run("extracts system message", func(t *testing.T) {
		content, role := extractMessageContent(NewSystemMessage("system prompt"))
		assert.Equal(t, "system prompt", content)
		assert.Equal(t, "system", role)
	})

	t.Run("extracts user message", func(t *testing.T) {
		content, role := extractMessageContent(NewUserMessage("hello"))
		assert.Equal(t, "hello", content)
		assert.Equal(t, "user", role)
	})

	t.Run("extracts assistant message", func(t *testing.T) {
		content, role := extractMessageContent(NewAssistantMessage("response"))
		assert.Equal(t, "response", content)
		assert.Equal(t, "assistant", role)
	})
}

func TestConvertMessagesToAnthropicPreservesAgentName(t *testing.T) {
	t.Run("prefixes assistant content with agent name", func(t *testing.T) {
		messages := addAgentNameToMessages([]Message{NewAssistantMessage("here is the code")}, "agent1")
		messages = append(messages, NewUserMessage("review it"))

		result, _ := convertMessagesToAnthropic(messages, nil)

		require.Len(t, result, 2)
		assert.Equal(t, "assistant", result[0].Role)
		assert.Contains(t, string(result[0].Content), "agent1: here is the code")
	})

	t.Run("leaves unnamed assistant content unchanged", func(t *testing.T) {
		messages := []Message{
			NewUserMessage("hi"),
			NewAssistantMessage("plain reply"),
		}

		result, _ := convertMessagesToAnthropic(messages, nil)

		require.Len(t, result, 2)
		assert.Equal(t, json.RawMessage(`"plain reply"`), result[1].Content)
	})

	t.Run("an agent is not labelled to itself but keeps its name for the dashboard", func(t *testing.T) {
		agent := &Agent{Name: "weather-agent"}
		choice := openai.ChatCompletionChoice{
			Message: openai.ChatCompletionMessage{Role: RoleAssistant, Content: "Let me check."},
		}

		msg := agent.processAssistantMessage(choice)

		require.NotNil(t, msg.OfAssistant)
		assert.Equal(t, "weather-agent", msg.OfAssistant.Name.Value, "the stored message keeps the name so the dashboard can label the sender")

		sent := withoutOwnAgentName([]Message{NewUserMessage("weather?"), msg}, agent.Name)
		result, _ := convertMessagesToAnthropic(sent, nil)
		require.Len(t, result, 2)
		assert.Equal(t, json.RawMessage(`"Let me check."`), result[1].Content)

		assert.Equal(t, "weather-agent", msg.OfAssistant.Name.Value, "suppressing the name for the model must not strip it from the stored message")
	})

	t.Run("another member's name survives suppression", func(t *testing.T) {
		other := addAgentNameToMessages([]Message{NewAssistantMessage("here is the code")}, "agent1")[0]

		sent := withoutOwnAgentName([]Message{other, NewUserMessage("review it")}, "agent2")
		result, _ := convertMessagesToAnthropic(sent, nil)

		require.Len(t, result, 2)
		assert.Contains(t, string(result[0].Content), "agent1: here is the code")
	})
}

func TestConvertMessagesToAnthropicMergesConsecutiveRoles(t *testing.T) {
	t.Run("tool transcript after a user turn stays alternating", func(t *testing.T) {
		toolCallAssistant := Message{OfAssistant: &openai.ChatCompletionAssistantMessageParam{}}
		toolCallAssistant.OfAssistant.Name = openai.String("agent1")

		messages := []Message{
			NewUserMessage("what is the weather?"),
			toolCallAssistant,
			ToolMessage("sunny, 20C", "call_1"),
			addAgentNameToMessages([]Message{NewAssistantMessage("It is sunny.")}, "agent1")[0],
			NewUserMessage("It is your turn, agent2."),
		}

		result, _ := convertMessagesToAnthropic(messages, nil)

		require.NotEmpty(t, result)
		for i := 1; i < len(result); i++ {
			assert.NotEqual(t, result[i-1].Role, result[i].Role, "consecutive same-role messages at %d", i)
		}
	})

	t.Run("no cache breakpoint lands on a merged block", func(t *testing.T) {
		messages := []Message{
			NewUserMessage("write then review"),
			addAgentNameToMessages([]Message{NewAssistantMessage("draft")}, "agent1")[0],
			addAgentNameToMessages([]Message{NewAssistantMessage("review")}, "agent2")[0],
			NewUserMessage("It is your turn, agent3."),
		}

		result, _ := convertMessagesToAnthropic(messages, nil)

		require.Len(t, result, 3)
		assert.Equal(t, "assistant", result[1].Role)
		assert.Equal(t, json.RawMessage(`"agent1: draft\n\nagent2: review"`), result[1].Content)
		assert.NotContains(t, string(result[1].Content), "cache_control",
			"a merged block's content changes between requests, so it must not anchor the cache prefix")
	})

	t.Run("merges consecutive tool results into one user turn", func(t *testing.T) {
		messages := []Message{
			NewUserMessage("compare them"),
			ToolMessage("first", "call_1"),
			ToolMessage("second", "call_2"),
		}

		result, _ := convertMessagesToAnthropic(messages, nil)

		require.Len(t, result, 1)
		assert.Equal(t, "user", result[0].Role)
		assert.Contains(t, string(result[0].Content), "first")
		assert.Contains(t, string(result[0].Content), "second")
	})
}

func functionTools(names ...string) []openai.ChatCompletionToolParam {
	tools := make([]openai.ChatCompletionToolParam, len(names))
	for i, name := range names {
		tools[i] = openai.ChatCompletionToolParam{Type: "function", Function: openai.FunctionDefinitionParam{Name: name}}
	}
	return tools
}

func assistantToolCalls(content string, calls ...openai.ChatCompletionMessageToolCallParam) Message {
	msg := NewAssistantMessage(content)
	msg.OfAssistant.ToolCalls = calls
	return msg
}

func toolCall(id, name, arguments string) openai.ChatCompletionMessageToolCallParam {
	return openai.ChatCompletionMessageToolCallParam{
		ID:       id,
		Function: openai.ChatCompletionMessageToolCallFunctionParam{Name: name, Arguments: arguments},
	}
}

func contentBlocksOf(t *testing.T, msg anthropicMessage) []anthropicMessageContent {
	t.Helper()
	var blocks []anthropicMessageContent
	require.NoError(t, json.Unmarshal(msg.Content, &blocks), "content is not a block array: %s", msg.Content)
	return blocks
}

func TestConvertMessagesToAnthropicToolBlocks(t *testing.T) {
	t.Run("sends a tool round trip as tool_use and tool_result blocks", func(t *testing.T) {
		messages := []Message{
			NewUserMessage("What is the weather in Boston?"),
			assistantToolCalls("", toolCall("call_1", "get_weather", `{"city":"Boston"}`)),
			ToolMessage("62F and raining", "call_1"),
		}

		result, _ := convertMessagesToAnthropic(messages, functionTools("get_weather"))

		require.Len(t, result, 3)
		assert.Equal(t, "user", result[0].Role)
		assert.Contains(t, string(result[0].Content), "What is the weather in Boston?")
		assert.NotContains(t, string(result[0].Content), "62F and raining", "the tool result must not be attributed to the user's question")

		assert.Equal(t, "assistant", result[1].Role)
		toolUse := contentBlocksOf(t, result[1])
		require.Len(t, toolUse, 1)
		assert.Equal(t, "tool_use", toolUse[0].Type)
		assert.Equal(t, "call_1", toolUse[0].ID)
		assert.Equal(t, "get_weather", toolUse[0].Name)
		assert.JSONEq(t, `{"city":"Boston"}`, string(toolUse[0].Input))

		assert.Equal(t, "user", result[2].Role)
		toolResult := contentBlocksOf(t, result[2])
		require.Len(t, toolResult, 1)
		assert.Equal(t, "tool_result", toolResult[0].Type)
		assert.Equal(t, "call_1", toolResult[0].ToolUseID)
		assert.Equal(t, "62F and raining", toolResult[0].Content)
	})

	t.Run("serializes tool blocks without unrelated fields", func(t *testing.T) {
		messages := []Message{
			NewUserMessage("status?"),
			assistantToolCalls("", toolCall("call_1", "ark_status", `{}`)),
			ToolMessage("ok", "call_1"),
		}

		result, _ := convertMessagesToAnthropic(messages, functionTools("ark_status"))

		require.Len(t, result, 3)
		assert.JSONEq(t, `[{"type":"tool_use","id":"call_1","name":"ark_status","input":{},"cache_control":{"type":"ephemeral"}}]`, string(result[1].Content))
		assert.JSONEq(t, `[{"type":"tool_result","tool_use_id":"call_1","content":"ok"}]`, string(result[2].Content))
	})

	t.Run("keeps assistant text before its tool_use blocks", func(t *testing.T) {
		messages := []Message{
			NewUserMessage("check it"),
			assistantToolCalls("Let me check.", toolCall("call_1", "kubectl", `{"args":"get pods"}`)),
			ToolMessage("no pods", "call_1"),
		}

		result, _ := convertMessagesToAnthropic(messages, functionTools("kubectl"))

		require.Len(t, result, 3)
		blocks := contentBlocksOf(t, result[1])
		require.Len(t, blocks, 2)
		assert.Equal(t, "text", blocks[0].Type)
		assert.Equal(t, "Let me check.", blocks[0].Text)
		assert.Equal(t, "tool_use", blocks[1].Type)
	})

	t.Run("prefixes a named assistant's text but not its tool_use block", func(t *testing.T) {
		named := addAgentNameToMessages([]Message{assistantToolCalls("Checking.", toolCall("call_1", "kubectl", `{}`))}, "agent1")[0]
		messages := []Message{NewUserMessage("go"), named, ToolMessage("done", "call_1")}

		result, _ := convertMessagesToAnthropic(messages, functionTools("kubectl"))

		blocks := contentBlocksOf(t, result[1])
		require.Len(t, blocks, 2)
		assert.Equal(t, "agent1: Checking.", blocks[0].Text)
		assert.Equal(t, "kubectl", blocks[1].Name)
	})

	t.Run("groups parallel tool results into one user turn", func(t *testing.T) {
		messages := []Message{
			NewUserMessage("compare"),
			assistantToolCalls("", toolCall("call_1", "search", `{"q":"a"}`), toolCall("call_2", "search", `{"q":"b"}`)),
			ToolMessage("first", "call_1"),
			ToolMessage("second", "call_2"),
		}

		result, _ := convertMessagesToAnthropic(messages, functionTools("search"))

		require.Len(t, result, 3)
		assert.Len(t, contentBlocksOf(t, result[1]), 2)
		results := contentBlocksOf(t, result[2])
		require.Len(t, results, 2)
		assert.Equal(t, "call_1", results[0].ToolUseID)
		assert.Equal(t, "call_2", results[1].ToolUseID)
	})

	t.Run("places tool_result blocks before text merged into the same user turn", func(t *testing.T) {
		messages := []Message{
			NewUserMessage("start"),
			assistantToolCalls("", toolCall("call_1", "search", `{}`)),
			ToolMessage("found", "call_1"),
			NewUserMessage("It is your turn, agent2."),
		}

		result, _ := convertMessagesToAnthropic(messages, functionTools("search"))

		require.Len(t, result, 3)
		blocks := contentBlocksOf(t, result[2])
		require.Len(t, blocks, 2)
		assert.Equal(t, "tool_result", blocks[0].Type)
		assert.Equal(t, "text", blocks[1].Type)
		assert.Equal(t, "It is your turn, agent2.", blocks[1].Text)
	})

	t.Run("marks the last block of the penultimate turn for caching", func(t *testing.T) {
		messages := []Message{
			NewUserMessage("start"),
			assistantToolCalls("Looking.", toolCall("call_1", "search", `{}`)),
			ToolMessage("found", "call_1"),
		}

		result, _ := convertMessagesToAnthropic(messages, functionTools("search"))

		blocks := contentBlocksOf(t, result[1])
		require.Len(t, blocks, 2)
		assert.Nil(t, blocks[0].CacheControl)
		require.NotNil(t, blocks[1].CacheControl)
		assert.Equal(t, "ephemeral", blocks[1].CacheControl.Type)
		assert.NotContains(t, string(result[2].Content), "cache_control")
	})

	t.Run("replaces malformed arguments with an empty input object", func(t *testing.T) {
		messages := []Message{
			NewUserMessage("go"),
			assistantToolCalls("", toolCall("call_1", "search", `not json`), toolCall("call_2", "search", "")),
			ToolMessage("a", "call_1"),
			ToolMessage("b", "call_2"),
		}

		result, _ := convertMessagesToAnthropic(messages, functionTools("search"))

		blocks := contentBlocksOf(t, result[1])
		require.Len(t, blocks, 2)
		assert.JSONEq(t, `{}`, string(blocks[0].Input))
		assert.JSONEq(t, `{}`, string(blocks[1].Input))
	})

	t.Run("keeps a paired tool result with empty content", func(t *testing.T) {
		messages := []Message{
			NewUserMessage("go"),
			assistantToolCalls("", toolCall("call_1", "noop", `{}`)),
			ToolMessage("", "call_1"),
		}

		result, _ := convertMessagesToAnthropic(messages, functionTools("noop"))

		require.Len(t, result, 3)
		blocks := contentBlocksOf(t, result[2])
		require.Len(t, blocks, 1)
		assert.Equal(t, "tool_result", blocks[0].Type)
		assert.Equal(t, "call_1", blocks[0].ToolUseID)
	})

	t.Run("joins text parts of a tool result", func(t *testing.T) {
		messages := []Message{
			NewUserMessage("go"),
			assistantToolCalls("", toolCall("call_1", "search", `{}`)),
			ToolMessage([]openai.ChatCompletionContentPartTextParam{{Text: "part one"}, {Text: "part two"}}, "call_1"),
		}

		result, _ := convertMessagesToAnthropic(messages, functionTools("search"))

		blocks := contentBlocksOf(t, result[2])
		require.Len(t, blocks, 1)
		assert.Equal(t, "part one\npart two", blocks[0].Content)
	})
}

func TestConvertMessagesToAnthropicToolBlockFallback(t *testing.T) {
	t.Run("falls back to text when the request defines no tools", func(t *testing.T) {
		messages := []Message{
			NewUserMessage("summarize"),
			assistantToolCalls("", toolCall("call_1", "search", `{}`)),
			ToolMessage("found it", "call_1"),
			NewUserMessage("It is your turn, agent2."),
		}

		result, _ := convertMessagesToAnthropic(messages, nil)

		assert.NotContains(t, string(mustMarshalRaw(result)), "tool_use")
		assert.NotContains(t, string(mustMarshalRaw(result)), "tool_result")
		assert.Contains(t, string(mustMarshalRaw(result)), "found it")
	})

	t.Run("falls back to text for a tool this request does not define", func(t *testing.T) {
		messages := []Message{
			NewUserMessage("summarize"),
			assistantToolCalls("", toolCall("call_1", "other_agents_tool", `{}`)),
			ToolMessage("their output", "call_1"),
		}

		result, _ := convertMessagesToAnthropic(messages, functionTools("my_tool"))

		assert.NotContains(t, string(mustMarshalRaw(result)), "tool_use")
		assert.NotContains(t, string(mustMarshalRaw(result)), "tool_result")
		assert.Contains(t, string(mustMarshalRaw(result)), "their output")
	})

	t.Run("falls back to text for a tool call without a result", func(t *testing.T) {
		messages := []Message{
			NewUserMessage("go"),
			assistantToolCalls("Trying.", toolCall("call_1", "search", `{}`)),
			NewUserMessage("continue"),
		}

		result, _ := convertMessagesToAnthropic(messages, functionTools("search"))

		require.Len(t, result, 3)
		assert.NotContains(t, string(mustMarshalRaw(result)), "tool_use")
		assert.Contains(t, string(result[1].Content), "Trying.")
	})

	t.Run("falls back to text for a tool result without a matching call", func(t *testing.T) {
		messages := []Message{
			NewUserMessage("go"),
			ToolMessage("orphaned", "call_missing"),
		}

		result, _ := convertMessagesToAnthropic(messages, functionTools("search"))

		require.Len(t, result, 1)
		assert.NotContains(t, string(result[0].Content), "tool_result")
		assert.Contains(t, string(result[0].Content), "orphaned")
	})

	t.Run("sends only the paired calls of a partially paired turn as blocks", func(t *testing.T) {
		messages := []Message{
			NewUserMessage("go"),
			assistantToolCalls("", toolCall("call_1", "search", `{}`), toolCall("call_2", "unknown", `{}`)),
			ToolMessage("searched", "call_1"),
			ToolMessage("unknown output", "call_2"),
		}

		result, _ := convertMessagesToAnthropic(messages, functionTools("search"))

		require.Len(t, result, 3)
		toolUse := contentBlocksOf(t, result[1])
		require.Len(t, toolUse, 1)
		assert.Equal(t, "call_1", toolUse[0].ID)

		userTurn := contentBlocksOf(t, result[2])
		require.Len(t, userTurn, 2)
		assert.Equal(t, "tool_result", userTurn[0].Type)
		assert.Equal(t, "text", userTurn[1].Type)
		assert.Equal(t, "unknown output", userTurn[1].Text)
	})

	t.Run("keeps roles alternating across paired and fallback turns", func(t *testing.T) {
		messages := []Message{
			NewUserMessage("start"),
			assistantToolCalls("", toolCall("call_1", "search", `{}`)),
			ToolMessage("found", "call_1"),
			addAgentNameToMessages([]Message{NewAssistantMessage("Done.")}, "agent1")[0],
			addAgentNameToMessages([]Message{assistantToolCalls("", toolCall("call_2", "foreign", `{}`))}, "agent2")[0],
			ToolMessage("foreign output", "call_2"),
			NewUserMessage("It is your turn, agent3."),
		}

		result, _ := convertMessagesToAnthropic(messages, functionTools("search"))

		require.NotEmpty(t, result)
		assert.Equal(t, "user", result[0].Role)
		for i := 1; i < len(result); i++ {
			assert.NotEqual(t, result[i-1].Role, result[i].Role, "consecutive same-role messages at %d", i)
		}
	})
}
