export const getGoSnippet = (
  fullEndpoint: string,
  selectedAgent: string,
): string => `package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

func main() {
	payload := map[string]interface{}{
		// Required: The agent to use (format: "agent/<name>")
		"model": "agent/${selectedAgent}",

		// Required: List of messages in the conversation
		"messages": []map[string]string{
			{"role": "system", "content": "You are a helpful assistant."},
			{"role": "user", "content": "Hello, how can you help me?"},
		},

		// Optional: Enable streaming responses (default: false)
		"stream": false,

		// Optional: Sampling temperature 0-2, higher = more random (default: 1)
		"temperature": 1.0,

		// Optional: Maximum tokens to generate (default: model-dependent)
		"max_tokens": 1024,

		// Optional: Custom metadata to pass to the agent
		"metadata": map[string]string{
			"sessionId": "my-session-id",
		},
	}

	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", "${fullEndpoint}", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	// Uncomment to use auth with key pair
	// req.SetBasicAuth("PUBLIC_KEY", "SECRET_KEY")
	// Uncomment to use auth with bearer token
	// req.Header.Set("Authorization", "Bearer YOUR_TOKEN_HERE")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()

	result, _ := io.ReadAll(resp.Body)
	fmt.Println(string(result))
}
`;
