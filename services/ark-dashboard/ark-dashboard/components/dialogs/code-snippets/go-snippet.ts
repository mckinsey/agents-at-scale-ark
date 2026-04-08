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
		"name":  "my-query",
		"type":  "user",
		"input": "Hello, how can you help me?",
		"target": map[string]string{
			"type": "agent",
			"name": "${selectedAgent}",
		},
		// Optional: Continue a conversation
		// "conversationId": "previous-conversation-id",
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
