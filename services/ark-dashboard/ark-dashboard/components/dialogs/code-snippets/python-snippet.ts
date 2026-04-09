export const getPythonSnippet = (
  fullEndpoint: string,
  selectedAgent: string,
): string => `import requests
from requests.auth import HTTPBasicAuth

response = requests.post(
    "${fullEndpoint}",

    # Uncomment to use auth with key pair
    # auth=HTTPBasicAuth(PUBLIC_KEY, SECRET_KEY),

    headers={
        "Content-Type": "application/json",
        # Uncomment to use auth with bearer token
        # "Authorization": "Bearer YOUR_TOKEN_HERE",
    },
    json={
        "name": "my-query",
        "type": "user",
        "input": "Hello, how can you help me?",
        "target": {
            "type": "agent",
            "name": "${selectedAgent}"
        },

        # Optional: Continue a conversation
        # "conversationId": "previous-conversation-id",

        # Optional: Session tracking
        # "sessionId": "my-session-id",

        # Optional: Query timeout
        # "timeout": "5m"
    }
)

print(response.json())
`;
