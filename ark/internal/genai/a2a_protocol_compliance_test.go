package genai

import (
	"bufio"
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type jsonRPCRequest struct {
	JSONRPC string      `json:"jsonrpc"`
	ID      interface{} `json:"id"`
	Method  string      `json:"method"`
	Params  interface{} `json:"params,omitempty"`
}

type jsonRPCResponse struct {
	JSONRPC string           `json:"jsonrpc"`
	ID      interface{}      `json:"id,omitempty"`
	Result  json.RawMessage  `json:"result,omitempty"`
	Error   *jsonRPCError    `json:"error,omitempty"`
}

type jsonRPCError struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

func postJSONRPC(t *testing.T, serverURL string, body string) *http.Response {
	t.Helper()
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Post(serverURL+"/", "application/json", strings.NewReader(body))
	require.NoError(t, err)
	return resp
}

func postRawJSONRPC(t *testing.T, serverURL string, body string, contentType string) *http.Response {
	t.Helper()
	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest(http.MethodPost, serverURL+"/", strings.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", contentType)
	resp, err := client.Do(req)
	require.NoError(t, err)
	return resp
}

func decodeJSONRPCResponse(t *testing.T, resp *http.Response) jsonRPCResponse {
	t.Helper()
	defer resp.Body.Close()
	var rpcResp jsonRPCResponse
	err := json.NewDecoder(resp.Body).Decode(&rpcResp)
	require.NoError(t, err)
	return rpcResp
}

func TestA2AComplianceAgentCardDiscovery(t *testing.T) {
	testServer := startStreamingTestServer(t)
	defer testServer.Close()

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(testServer.URL + "/.well-known/agent.json")
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Contains(t, resp.Header.Get("Content-Type"), "application/json")

	var card map[string]interface{}
	err = json.NewDecoder(resp.Body).Decode(&card)
	require.NoError(t, err)

	assert.NotEmpty(t, card["name"], "agent card must have name")
	assert.NotEmpty(t, card["description"], "agent card must have description")
	assert.NotEmpty(t, card["version"], "agent card must have version")
	assert.NotNil(t, card["capabilities"], "agent card must have capabilities")
	assert.NotNil(t, card["skills"], "agent card must have skills")
	assert.NotNil(t, card["defaultInputModes"], "agent card must have defaultInputModes")
	assert.NotNil(t, card["defaultOutputModes"], "agent card must have defaultOutputModes")

	skills, ok := card["skills"].([]interface{})
	require.True(t, ok, "skills must be an array")
	require.NotEmpty(t, skills, "skills must not be empty")
	firstSkill, ok := skills[0].(map[string]interface{})
	require.True(t, ok)
	assert.NotEmpty(t, firstSkill["id"], "skill must have id")
	assert.NotEmpty(t, firstSkill["name"], "skill must have name")

	caps, ok := card["capabilities"].(map[string]interface{})
	require.True(t, ok, "capabilities must be an object")
	assert.Equal(t, true, caps["streaming"], "capabilities.streaming must be true")
}

func TestA2AComplianceJSONRPCParseError(t *testing.T) {
	testServer := startStreamingTestServer(t)
	defer testServer.Close()

	resp := postRawJSONRPC(t, testServer.URL, `{invalid json`, "application/json")
	rpcResp := decodeJSONRPCResponse(t, resp)

	require.NotNil(t, rpcResp.Error, "must return JSON-RPC error for invalid JSON")
	assert.Equal(t, -32700, rpcResp.Error.Code, "parse error code must be -32700")
	assert.Equal(t, "2.0", rpcResp.JSONRPC)
}

func TestA2AComplianceJSONRPCMethodNotFound(t *testing.T) {
	testServer := startStreamingTestServer(t)
	defer testServer.Close()

	reqBody, _ := json.Marshal(jsonRPCRequest{
		JSONRPC: "2.0",
		ID:      "test-mnf",
		Method:  "nonexistent/method",
	})
	resp := postJSONRPC(t, testServer.URL, string(reqBody))
	rpcResp := decodeJSONRPCResponse(t, resp)

	require.NotNil(t, rpcResp.Error, "must return JSON-RPC error for unknown method")
	assert.Equal(t, -32601, rpcResp.Error.Code, "method not found code must be -32601")
	assert.Equal(t, "2.0", rpcResp.JSONRPC)
	assert.Equal(t, "test-mnf", rpcResp.ID)
}

func TestA2AComplianceMessageSend(t *testing.T) {
	testServer := startStreamingTestServer(t)
	defer testServer.Close()

	reqBody, _ := json.Marshal(jsonRPCRequest{
		JSONRPC: "2.0",
		ID:      "test-send",
		Method:  "message/send",
		Params: map[string]interface{}{
			"message": map[string]interface{}{
				"role": "user",
				"parts": []map[string]interface{}{
					{"kind": "text", "text": "hello"},
				},
			},
		},
	})

	resp := postJSONRPC(t, testServer.URL, string(reqBody))
	require.Equal(t, http.StatusOK, resp.StatusCode)
	rpcResp := decodeJSONRPCResponse(t, resp)

	assert.Equal(t, "2.0", rpcResp.JSONRPC)
	assert.Equal(t, "test-send", rpcResp.ID)
	assert.Nil(t, rpcResp.Error, "message/send must not return error for valid input")
	require.NotNil(t, rpcResp.Result, "message/send must return a result")

	var result map[string]interface{}
	err := json.Unmarshal(rpcResp.Result, &result)
	require.NoError(t, err)
	assert.NotEmpty(t, result["id"], "task must have an id")
	status, ok := result["status"].(map[string]interface{})
	require.True(t, ok, "task must have a status object")
	assert.NotEmpty(t, status["state"], "status must have a state")
}

func TestA2AComplianceMessageStream(t *testing.T) {
	testServer := startStreamingTestServer(t)
	defer testServer.Close()

	reqBody, _ := json.Marshal(jsonRPCRequest{
		JSONRPC: "2.0",
		ID:      "test-stream",
		Method:  "message/stream",
		Params: map[string]interface{}{
			"message": map[string]interface{}{
				"role": "user",
				"parts": []map[string]interface{}{
					{"kind": "text", "text": "hello"},
				},
			},
		},
	})

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Post(testServer.URL+"/", "application/json", bytes.NewReader(reqBody))
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Contains(t, resp.Header.Get("Content-Type"), "text/event-stream")

	scanner := bufio.NewScanner(resp.Body)
	var events []jsonRPCResponse
	var eventTypes []string
	var dataBuffer bytes.Buffer
	currentEventType := ""

	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "event:") {
			currentEventType = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
		} else if strings.HasPrefix(line, "data:") {
			dataChunk := strings.TrimPrefix(line, "data:")
			if len(dataChunk) > 0 && dataChunk[0] == ' ' {
				dataChunk = dataChunk[1:]
			}
			dataBuffer.WriteString(dataChunk)
		} else if line == "" && dataBuffer.Len() > 0 {
			var sseResp jsonRPCResponse
			err := json.Unmarshal(dataBuffer.Bytes(), &sseResp)
			require.NoError(t, err, "SSE data must be valid JSON-RPC: %s", dataBuffer.String())
			events = append(events, sseResp)
			eventTypes = append(eventTypes, currentEventType)
			dataBuffer.Reset()
			currentEventType = ""
		}
	}
	if dataBuffer.Len() > 0 {
		var sseResp jsonRPCResponse
		err := json.Unmarshal(dataBuffer.Bytes(), &sseResp)
		require.NoError(t, err)
		events = append(events, sseResp)
		eventTypes = append(eventTypes, currentEventType)
	}

	require.Greater(t, len(events), 1, "stream must emit more than one SSE event")

	for i, ev := range events {
		assert.Equal(t, "2.0", ev.JSONRPC, "event %d must have jsonrpc 2.0", i)
		assert.Nil(t, ev.Error, "event %d must not be an error", i)
		assert.NotNil(t, ev.Result, "event %d must have a result", i)
	}

	nonTerminalCount := 0
	for _, evType := range eventTypes {
		if evType != "" {
			nonTerminalCount++
		}
	}
	assert.Greater(t, nonTerminalCount, 1, "must have multiple typed SSE events")

	foundStatusUpdate := false
	foundArtifactUpdate := false
	for _, evType := range eventTypes {
		if evType == "task_status_update" {
			foundStatusUpdate = true
		}
		if evType == "task_artifact_update" {
			foundArtifactUpdate = true
		}
	}
	assert.True(t, foundStatusUpdate, "stream must contain at least one task_status_update event")
	assert.True(t, foundArtifactUpdate, "stream must contain at least one task_artifact_update event")
}

func TestA2AComplianceCapabilityHonesty(t *testing.T) {
	testServer := startStreamingTestServer(t)
	defer testServer.Close()

	client := &http.Client{Timeout: 10 * time.Second}
	cardResp, err := client.Get(testServer.URL + "/.well-known/agent.json")
	require.NoError(t, err)
	defer cardResp.Body.Close()

	var card map[string]interface{}
	err = json.NewDecoder(cardResp.Body).Decode(&card)
	require.NoError(t, err)

	caps, ok := card["capabilities"].(map[string]interface{})
	require.True(t, ok)
	declaresStreaming := caps["streaming"] == true

	reqBody, _ := json.Marshal(jsonRPCRequest{
		JSONRPC: "2.0",
		ID:      "test-cap",
		Method:  "message/stream",
		Params: map[string]interface{}{
			"message": map[string]interface{}{
				"role": "user",
				"parts": []map[string]interface{}{
					{"kind": "text", "text": "hello"},
				},
			},
		},
	})

	streamResp, err := client.Post(testServer.URL+"/", "application/json", bytes.NewReader(reqBody))
	require.NoError(t, err)
	defer streamResp.Body.Close()

	if declaresStreaming {
		assert.Equal(t, http.StatusOK, streamResp.StatusCode, "declared streaming agent must accept stream requests")
		assert.Contains(t, streamResp.Header.Get("Content-Type"), "text/event-stream", "declared streaming agent must respond with SSE")

		body, _ := io.ReadAll(streamResp.Body)
		assert.Contains(t, string(body), "event:", "SSE response must contain event frames")
	} else {
		t.Log("Agent does not declare streaming capability; skipping stream behavior check")
	}
}
