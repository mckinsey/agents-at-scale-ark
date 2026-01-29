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
        # Required: The agent to use (format: "agent/<name>")
        "model": "agent/${selectedAgent}",

        # Required: List of messages in the conversation
        "messages": [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "Hello, how can you help me?"}
        ],

        # Optional: Enable streaming responses (default: false)
        "stream": False,

        # Optional: Sampling temperature 0-2, higher = more random (default: 1)
        "temperature": 1.0,

        # Optional: Maximum tokens to generate (default: model-dependent)
        "max_tokens": 1024,

        # Optional: Custom metadata to pass to the agent
        "metadata": {
            "sessionId": "my-session-id"
        }
    }
)

print(response.json())
`;
