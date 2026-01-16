# Fark HTTP API Documentation

The Fark HTTP API provides a RESTful interface with clear separation between listing and querying operations.

## API Structure

The API follows a clean RESTful design:
- **GET** endpoints for listing resources (plural form): `/agents`, `/teams`, `/models`, `/tools`, `/queries`
- **POST** endpoints for querying specific resources (singular form with name in path): `/agent/{name}`, `/team/{name}`, etc.

## HTTP Server API

When running in server mode, Fark provides a RESTful API with clear separation between listing and querying operations.

### API Structure

- **GET endpoints** (plural): List resources - `/agents`, `/teams`, `/models`, `/tools`, `/queries`
- **POST endpoints** (singular with name in path): Query specific resources - `/agent/{name}`, `/team/{name}`, etc.

### Listing Resources

**GET /agents** - List all agents
**GET /teams** - List all teams  
**GET /models** - List all models
**GET /tools** - List all tools
**GET /queries** - List all saved queries

**Response:** JSON array of resource objects.

### Querying Resources

**POST /agent/{name}** - Query a specific agent
**POST /team/{name}** - Query a specific team
**POST /model/{name}** - Query a specific model
**POST /tool/{name}** - Query a specific tool

**Request body:**
```json
{
  "input": "Your query text here",
  "parameters": [
    {"name": "param1", "value": "value1"}
  ],
  "sessionId": "optional-session-id"
}
```

**POST /query/{name}** - Trigger a specific saved query

**Request body:**
```json
{
  "inputOverride": "optional-new-input-text",
  "parameters": [
    {"name": "param1", "value": "value1"}
  ],
  "sessionId": "optional-session-id"
}
```

**Response:** Server-sent events stream with query status updates and final results.

### Example HTTP Requests

List all agents:
```bash
curl -X GET http://localhost:8080/agents
```

Query a specific agent:
```bash
curl -X POST http://localhost:8080/agent/weather-agent \
  -H "Content-Type: application/json" \
  -d '{
    "input": "What is the weather today?",
    "parameters": [{"name": "location", "value": "New York"}]
  }'
```

Query a specific team:
```bash
curl -X POST http://localhost:8080/team/analysis-team \
  -H "Content-Type: application/json" \
  -d '{"input": "Analyze market trends"}'
```

Trigger a saved query:
```bash
curl -X POST http://localhost:8080/query/my-saved-query \
  -H "Content-Type: application/json" \
  -d '{
    "inputOverride": "New input text",
    "parameters": [{"name": "param1", "value": "new-value"}]
  }'
```


### Agents

#### GET `/agents` - List all agents
Lists all available agents (equivalent to `fark agent` CLI command).

**Response:** JSON array of agent objects.

#### POST `/agent/{name}` - Query a specific agent
Queries a specific agent with input text (equivalent to `fark agent <name> <input>` CLI command).

**URL Parameters:**
- `name`: The name of the agent to query

**Request Body:**
```json
{
  "input": "Your query text here",
  "parameters": [
    {"name": "param1", "value": "value1"}
  ],
  "sessionId": "optional-session-id"
}
```

**Response:** Server-sent events stream with query results.

### Teams

#### GET `/teams` - List all teams
Lists all available teams (equivalent to `fark team` CLI command).

#### POST `/team/{name}` - Query a specific team
Queries a specific team with input text (equivalent to `fark team <name> <input>` CLI command).

**URL Parameters:**
- `name`: The name of the team to query

**Request Body:** Same format as agents endpoint.

### Models

#### GET `/models` - List all models
Lists all available models (equivalent to `fark model` CLI command).

#### POST `/model/{name}` - Query a specific model
Queries a specific model with input text (equivalent to `fark model <name> <input>` CLI command).

**URL Parameters:**
- `name`: The name of the model to query

**Request Body:** Same format as agents endpoint.

### Tools

#### GET `/tools` - List all tools
Lists all available tools (equivalent to `fark tool` CLI command).

#### POST `/tool/{name}` - Query a specific tool
Queries a specific tool with input text (equivalent to `fark tool <name> <input>` CLI command).

**URL Parameters:**
- `name`: The name of the tool to query

**Request Body:** Same format as agents endpoint.

### Queries

#### GET `/queries` - List all queries
Lists all saved queries (equivalent to `fark query` CLI command).

#### POST `/query/{name}` - Trigger a specific query
Triggers an existing saved query (equivalent to `fark query <name>` CLI command).

**URL Parameters:**
- `name`: The name of the query to trigger

**Request Body:**
```json
{
  "inputOverride": "optional-new-input-text",
  "parameters": [
    {"name": "param1", "value": "value1"}
  ],
  "sessionId": "optional-session-id"
}
```

## RESTful API Design

The Fark HTTP API follows RESTful principles with clear separation of concerns:
- Resource names in URL paths for specificity
- HTTP methods indicate operation type (GET for read, POST for action)
- Clean and intuitive endpoint structure

## Examples

### List all agents
```bash
curl -X GET http://localhost:8080/agents
```

### Query a specific agent
```bash
curl -X POST http://localhost:8080/agent/weather-agent \
  -H "Content-Type: application/json" \
  -d '{
    "input": "What is the weather today?",
    "parameters": [{"name": "location", "value": "New York"}]
  }'
```

### List all teams
```bash
curl -X GET http://localhost:8080/teams
```

### Query a specific team
```bash
curl -X POST http://localhost:8080/team/analysis-team \
  -H "Content-Type: application/json" \
  -d '{
    "input": "Analyze market trends"
  }'
```

### Trigger a saved query
```bash
curl -X POST http://localhost:8080/query/my-saved-query \
  -H "Content-Type: application/json" \
  -d '{
    "inputOverride": "New input text",
    "parameters": [{"name": "param1", "value": "new-value"}]
  }'
```

## Response Format

All query operations return server-sent events (SSE) streams with real-time updates:

```
data: {"type": "MODIFIED", "phase": "running", "query": {...}}

data: {"type": "kubernetes_event", "reason": "QueryStarted", "message": "..."}

data: {"type": "MODIFIED", "phase": "done", "query": {...}}
```

The final event contains the complete query object with results in the `status.response` field.

