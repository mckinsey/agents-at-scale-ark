export const getBashSnippet = (
  fullEndpoint: string,
  selectedAgent: string,
): string => `# Optional: Uncomment and move to the line after curl to use auth with key pair:
#   -u PUBLIC_KEY:SECRET_KEY \\
# Optional: Uncomment and move to the line after curl to use auth with bearer token:
#   -H "Authorization: Bearer YOUR_TOKEN_HERE" \\
curl -X POST "${fullEndpoint}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "agent/${selectedAgent}",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello, how can you help me?"}
    ],
    "stream": false,
    "temperature": 1.0,
    "max_tokens": 1024,
    "metadata": {
      "sessionId": "my-session-id"
    }
  }'

# Fields:
# - model (required): The agent to use, format "agent/<name>"
# - messages (required): List of messages with role (system/user/assistant) and content
# - stream (optional): Enable streaming responses, default false
# - temperature (optional): Sampling temperature 0-2, higher = more random, default 1
# - max_tokens (optional): Maximum tokens to generate
# - metadata (optional): Custom metadata to pass to the agent
`;
