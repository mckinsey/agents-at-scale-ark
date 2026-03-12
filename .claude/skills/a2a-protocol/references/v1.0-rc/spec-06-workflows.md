---
source: "Agent2Agent (A2A) Protocol Specification (RC v1.0)"
authors: "Google / A2A Project (Linux Foundation)"
source_url: "https://github.com/google-a2a/A2A/blob/main/docs/specification.md"
project_url: "https://a2a-protocol.org"
license: "Apache-2.0"
---

## 6. Common Workflows & Examples

This section provides illustrative examples of common A2A interactions across different bindings.

### 6.1. Basic Task Execution

**Scenario:** Client asks a question and receives a completed task response.

**Request:**

```http
POST /message:send HTTP/1.1
Host: agent.example.com
Content-Type: application/a2a+json
Authorization: Bearer token

{
  "message": {
    "role": "ROLE_USER",
    "parts": [{"text": "What is the weather today?"}],
    "messageId": "msg-uuid"
  }
}
```

**Response:**

```http
HTTP/1.1 200 OK
Content-Type: application/a2a+json

{
  "task": {
    "id": "task-uuid",
    "contextId": "context-uuid",
    "status": {"state": "TASK_STATE_COMPLETED"},
    "artifacts": [{
      "artifactId": "artifact-uuid",
      "name": "Weather Report",
      "parts": [{"text": "Today will be sunny with a high of 75°F"}]
    }]
  }
}
```

### 6.2. Streaming Task Execution

**Scenario:** Client requests a long-running task with real-time updates.

**Request:**

```http
POST /message:stream HTTP/1.1
Host: agent.example.com
Content-Type: application/a2a+json
Authorization: Bearer token

{
  "message": {
    "role": "ROLE_USER",
    "parts": [{"text": "Write a detailed report on climate change"}],
    "messageId": "msg-uuid"
  }
}
```

**SSE Response Stream:**

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream

data: {"task": {"id": "task-uuid", "status": {"state": "TASK_STATE_WORKING"}}}

data: {"artifactUpdate": {"taskId": "task-uuid", "artifact": {"parts": [{"text": "# Climate Change Report\n\n"}]}}}

data: {"statusUpdate": {"taskId": "task-uuid", "status": {"state": "TASK_STATE_COMPLETED"}}}
```

### 6.3. Multi-Turn Interaction

**Scenario:** Agent requires additional input to complete a task.

**Initial Request:**

```http
POST /message:send HTTP/1.1
Host: agent.example.com
Content-Type: application/a2a+json
Authorization: Bearer token

{
  "message": {
    "role": "ROLE_USER",
    "parts": [{"text": "Book me a flight"}],
    "messageId": "msg-1"
  }
}
```

**Response (Input Required):**

```http
HTTP/1.1 200 OK
Content-Type: application/a2a+json

{
  "task": {
    "id": "task-uuid",
    "status": {
      "state": "TASK_STATE_INPUT_REQUIRED",
      "message": {
        "role": "ROLE_AGENT",
        "parts": [{"text": "I need more details. Where would you like to fly from and to?"}]
      }
    }
  }
}
```

**Follow-up Request:**

```http
POST /message:send HTTP/1.1
Host: agent.example.com
Content-Type: application/a2a+json
Authorization: Bearer token

{
  "message": {
    "taskId": "task-uuid",
    "role": "ROLE_USER",
    "parts": [{"text": "From San Francisco to New York"}],
    "messageId": "msg-2"
  }
}
```

### 6.4. Version Negotiation Error

**Scenario:** Client requests an unsupported protocol version.

**Request:**

```http
POST /message:send HTTP/1.1
Host: agent.example.com
Content-Type: application/a2a+json
Authorization: Bearer token
A2A-Version: 0.5

{
  "message": {
    "role": "ROLE_USER",
    "parts": [{"text": "Hello"}],
    "messageId": "msg-uuid"
  }
}
```

**Response:**

```http
HTTP/1.1 400 Bad Request
Content-Type: application/problem+json

{
  "type": "https://a2a-protocol.org/errors/version-not-supported",
  "title": "Protocol Version Not Supported",
  "status": 400,
  "detail": "The requested A2A protocol version 0.5 is not supported by this agent",
  "supportedVersions": ["0.3"]
}
```

### 6.5. Task Listing and Management

**Scenario:** Client wants to see all tasks from a specific context or all tasks with a particular status.

#### Request: All tasks from a specific context

**Request:**

```http
POST /tasks/list HTTP/1.1
Host: agent.example.com
Content-Type: application/a2a+json
Authorization: Bearer token

{
  "contextId": "c295ea44-7543-4f78-b524-7a38915ad6e4",
  "pageSize": 10,
  "historyLength": 3
}
```

**Response:**

```http
HTTP/1.1 200 OK
Content-Type: application/a2a+json

{
  "tasks": [
    {
      "id": "3f36680c-7f37-4a5f-945e-d78981fafd36",
      "contextId": "c295ea44-7543-4f78-b524-7a38915ad6e4",
      "status": {
        "state": "TASK_STATE_COMPLETED",
        "timestamp": "2024-03-15T10:15:00Z"
      }
    }
  ],
  "totalSize": 5,
  "pageSize": 10,
  "nextPageToken": ""
}
```

#### Request: All working tasks across all contexts

**Request:**

```http
POST /tasks/list HTTP/1.1
Host: agent.example.com
Content-Type: application/a2a+json
Authorization: Bearer token

{
  "status": "TASK_STATE_WORKING",
  "pageSize": 20
}
```

**Response:**

```http
HTTP/1.1 200 OK
Content-Type: application/a2a+json

{
  "tasks": [
    {
      "id": "789abc-def0-1234-5678-9abcdef01234",
      "contextId": "another-context-id",
      "status": {
        "state": "TASK_STATE_WORKING",
        "message": {
          "role": "ROLE_AGENT",
          "parts": [
            {
              "text": "Processing your document analysis..."
            }
          ],
          "messageId": "msg-status-update"
        },
        "timestamp": "2024-03-15T10:20:00Z"
      }
    }
  ],
  "totalSize": 1,
  "pageSize": 20,
  "nextPageToken": ""
}
```

#### Pagination Example

**Request:**

```http
POST /tasks/list HTTP/1.1
Host: agent.example.com
Content-Type: application/a2a+json
Authorization: Bearer token

{
  "contextId": "c295ea44-7543-4f78-b524-7a38915ad6e4",
  "pageSize": 10,
  "pageToken": "base64-encoded-cursor-token"
}
```

**Response:**

```http
HTTP/1.1 200 OK
Content-Type: application/a2a+json

{
  "tasks": [
    /* ... additional tasks */
  ],
  "totalSize": 15,
  "pageSize": 10,
  "nextPageToken": "base64-encoded-next-cursor-token"
}
```

#### Validation Error Example

**Request:**

```http
POST /tasks/list HTTP/1.1
Host: agent.example.com
Content-Type: application/a2a+json
Authorization: Bearer token

{
  "pageSize": 150,
  "historyLength": -5,
  "status": "running"
}
```

**Response:**

```http
HTTP/1.1 400 Bad Request
Content-Type: application/problem+json

{
  "status": 400,
  "detail": "Invalid parameters",
  "errors": [
    {
      "field": "pageSize",
      "message": "Must be between 1 and 100 inclusive, got 150"
    },
    {
      "field": "historyLength",
      "message": "Must be non-negative integer, got -5"
    },
    {
      "field": "status",
      "message": "Invalid status value 'running'. Must be one of: pending, working, completed, failed, canceled"
    }
  ]
}
```

### 6.6. Push Notification Setup and Usage

**Scenario:** Client requests a long-running report generation and wants to be notified via webhook when it's done.

**Initial Request with Push Notification Config:**

```http
POST /message:send HTTP/1.1
Host: agent.example.com
Content-Type: application/a2a+json
Authorization: Bearer token

{
  "message": {
    "role": "ROLE_USER",
    "parts": [
      {
        "text": "Generate the Q1 sales report. This usually takes a while. Notify me when it's ready."
      }
    ],
    "messageId": "6dbc13b5-bd57-4c2b-b503-24e381b6c8d6"
  },
  "configuration": {
    "pushNotificationConfig": {
      "url": "https://client.example.com/webhook/a2a-notifications",
      "token": "secure-client-token-for-task-aaa",
      "authentication": {
        "schemes": ["Bearer"]
      }
    }
  }
}
```

**Response (Task Submitted):**

```http
HTTP/1.1 200 OK
Content-Type: application/a2a+json

{
  "task": {
    "id": "43667960-d455-4453-b0cf-1bae4955270d",
    "contextId": "c295ea44-7543-4f78-b524-7a38915ad6e4",
    "status": {
      "state": "submitted",
      "timestamp": "2024-03-15T11:00:00Z"
    }
  }
}
```

**Later: Server POSTs Notification to Webhook:**

```http
POST /webhook/a2a-notifications HTTP/1.1
Host: client.example.com
Authorization: Bearer server-generated-jwt
Content-Type: application/a2a+json
X-A2A-Notification-Token: secure-client-token-for-task-aaa

{
  "statusUpdate": {
    "taskId": "43667960-d455-4453-b0cf-1bae4955270d",
    "contextId": "c295ea44-7543-4f78-b524-7a38915ad6e4",
    "status": {
      "state": "TASK_STATE_COMPLETED",
      "timestamp": "2024-03-15T18:30:00Z"
    }
  }
}
```

### 6.7. File Exchange (Upload and Download)

**Scenario:** Client sends an image for analysis, and the agent returns a modified image.

**Request with File Upload:**

```http
POST /message:send HTTP/1.1
Host: agent.example.com
Content-Type: application/a2a+json
Authorization: Bearer token

{
  "message": {
    "role": "ROLE_USER",
    "parts": [
      {
        "text": "Analyze this image and highlight any faces."
      },
      {
        "raw": "iVBORw0KGgoAAAANSUhEUgAAAAUA..."
        "filename": "input_image.png",
        "mediaType": "image/png",
      }
    ],
    "messageId": "6dbc13b5-bd57-4c2b-b503-24e381b6c8d6"
  }
}
```

**Response with File Reference:**

```http
HTTP/1.1 200 OK
Content-Type: application/a2a+json

{
  "task": {
    "id": "43667960-d455-4453-b0cf-1bae4955270d",
    "contextId": "c295ea44-7543-4f78-b524-7a38915ad6e4",
    "status": {
      "state": "TASK_STATE_COMPLETED",
      "timestamp": "2024-03-15T12:05:00Z"
    },
    "artifacts": [
      {
        "artifactId": "9b6934dd-37e3-4eb1-8766-962efaab63a1",
        "name": "processed_image_with_faces.png",
        "parts": [
          {
            "url": "https://storage.example.com/processed/task-bbb/output.png?token=xyz",
            "filename": "output.png",
            "mediaType": "image/png"
          }
        ]
      }
    ]
  }
}
```

### 6.8. Structured Data Exchange

**Scenario:** Client asks for a list of open support tickets in a specific JSON format.

**Request:**

```http
POST /message:send HTTP/1.1
Host: agent.example.com
Content-Type: application/a2a+json
Authorization: Bearer token

{
  "message": {
    "role": "ROLE_USER",
    "parts": [
      {
        "text": "Show me a list of my open IT tickets",
        "metadata": {
          "mediaType": "application/json",
          "schema": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "ticketNumber": { "type": "string" },
                "description": { "type": "string" }
              }
            }
          }
        }
      }
    ],
    "messageId": "85b26db5-ffbb-4278-a5da-a7b09dea1b47"
  }
}
```

**Response with Structured Data:**

```http
HTTP/1.1 200 OK
Content-Type: application/a2a+json

{
  "task": {
    "id": "d8c6243f-5f7a-4f6f-821d-957ce51e856c",
    "contextId": "c295ea44-7543-4f78-b524-7a38915ad6e4",
    "status": {
      "state": "TASK_STATE_COMPLETED",
      "timestamp": "2025-04-17T17:47:09.680794Z"
    },
    "artifacts": [
      {
        "artifactId": "c5e0382f-b57f-4da7-87d8-b85171fad17c",
        "parts": [
          {
            "text": "[{\"ticketNumber\":\"REQ12312\",\"description\":\"request for VPN access\"},{\"ticketNumber\":\"REQ23422\",\"description\":\"Add to DL - team-gcp-onboarding\"}]"
          }
        ]
      }
    ]
  }
}
```

### 6.9. Fetching Authenticated Extended Agent Card

**Scenario:** A client discovers a public Agent Card indicating support for an authenticated extended card and wants to retrieve the full details.

**Step 1: Client fetches the public Agent Card:**

```http
GET /.well-known/agent-card.json HTTP/1.1
Host: example.com
```

**Response includes:**

```json
{
  "capabilities": {
    "extendedAgentCard": true
  },
  "securitySchemes": {
    "google": {
      "openIdConnectSecurityScheme": {
        "openIdConnectUrl": "https://accounts.google.com/.well-known/openid-configuration"
      }
    }
  }
}
```

### Step 2: Client obtains credentials (out-of-band OAuth 2.0 flow)

### Step 3: Client fetches authenticated extended Agent Card

```http
GET /extendedAgentCard HTTP/1.1
Host: agent.example.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**

```http
HTTP/1.1 200 OK
Content-Type: application/a2a+json

{
  "name": "Extended Agent with Additional Skills",
  "skills": [
    /* Extended skills available to authenticated users */
  ]
}
```
