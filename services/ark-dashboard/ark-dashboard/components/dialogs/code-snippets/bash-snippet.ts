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
    "name": "my-query",
    "type": "user",
    "input": "Hello, how can you help me?",
    "target": {
      "type": "agent",
      "name": "${selectedAgent}"
    }
  }'

# Fields:
# - name (required): Unique query name
# - type: "user" (default)
# - input (required): User message text
# - target (required): Target agent/model/team with type and name
# - conversationId (optional): Continue a previous conversation
# - sessionId (optional): Session tracking ID
# - timeout (optional): Query timeout e.g. "5m"
`;
