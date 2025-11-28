# Observability and Event Recording

The ark operator provides comprehensive observability through a structured event recording system with configurable verbosity levels.

## Event Recording Architecture

All operations in the system are tracked using specialized recorders in the `eventing` package:

### Operation Recorders
Each resource type has a dedicated recorder that tracks operations with timing and lifecycle management:
- **QueryRecorder**: Tracks query execution lifecycle
- **AgentRecorder**: Tracks agent execution
- **TeamRecorder**: Tracks team strategy execution
- **ToolRecorder**: Tracks tool invocations
- **ModelRecorder**: Tracks model interactions
- **MCPServerRecorder**: Tracks MCP server operations
- **MemoryRecorder**: Tracks memory operations

### Operation Tracking Pattern
All operations follow a consistent naming pattern:
- **Start events**: `{Operation}Start` - Emitted when operations begin
- **Completion events**: `{Operation}Complete` - Emitted when operations succeed with duration
- **Error events**: `{Operation}Error` - Emitted when operations fail with error details

### Structured Event Data
Events now include structured metadata stored in the annotation `ark.mckinsey.com/event-data` as JSON, containing:
- Operation context (queryId, sessionId, namespace)
- Timing information (timestamp, durationMs)
- Component-specific data (toolName, agentName, parameters, etc.)

## Verbosity Levels

The system uses 4 verbosity levels to control event granularity:

### Level 0 (Always Visible) - Critical Operations
**Always emitted regardless of log configuration**

- **Query Execution**: Query start, completion, and errors
- **Model Operations**: Model validation and configuration

**Use Case**: Production monitoring, health checks, SLA tracking

**Example Events**:
```json
{
  "name": "my-query",
  "namespace": "default",
  "targets": "2",
  "component": "query"
}
```

### Level 1 (Standard) - Operational Events  
**Emitted when log verbosity >= 1**

- **Agent Execution**: Agent lifecycle and configuration
- **Team Execution**: Team strategy execution  
- **Tool Calls**: Tool invocation and results
- **Team Members**: Individual team member execution

**Use Case**: Standard operations monitoring, debugging workflows

**Example Events**:
```json
{
  "name": "my-agent", 
  "model": "gpt-4",
  "component": "agent",
  "duration": "2.5s"
}
```

### Level 2 (Detailed) - LLM Interactions
**Emitted when log verbosity >= 2**

- **LLM Calls**: Model API calls and responses
- **Model Interactions**: Request/response cycles

**Use Case**: Debugging model interactions, performance tuning, cost tracking

**Example Events**:
```json
{
  "name": "gpt-4",
  "agent": "my-agent", 
  "model": "gpt-4",
  "component": "llm",
  "duration": "1.2s"
}
```

### Level 3 (Debug) - Response Content
**Emitted when log verbosity >= 3**

- **Response Content**: Full LLM response data
- **Termination Messages**: Detailed termination reasons
- **Detailed Operational Data**: Complete context and metadata

**Use Case**: Full debugging, content analysis, development

**Security Warning**: Contains sensitive data from LLM responses

## Configuration

### Development Environment

```bash
# Level 0 (default) - critical operations only
cd ark && make dev

# Level 1 - add operational events
cd ark && make dev ARGS="--zap-log-level=1"

# Level 2 - add LLM call tracking
cd ark && make dev ARGS="--zap-log-level=2"

# Level 3 - add response content (debug)
cd ark && make dev ARGS="--zap-log-level=3"
```

### Production Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ark-controller
spec:
  template:
    spec:
      containers:
      - name: manager
        env:
        - name: ZAPLOGLEVEL
          value: "1"  # Recommended for production
        args:
        - --zap-log-level=$(ZAPLOGLEVEL)
```

### Environment Variables

| Variable | Values | Description |
|----------|--------|-------------|
| `ZAPLOGLEVEL` | `0-3` | Controls event verbosity level |

## Monitoring and Observability

### Viewing Events

#### All Events
```bash
# View all operator events
kubectl get events --sort-by='.lastTimestamp'

# Filter by event type
kubectl get events --field-selector reason=QueryExecutionStart

# View structured event data from annotations
kubectl get events -o json | jq -r '.items[] | select(.metadata.annotations."ark.mckinsey.com/event-data") | {reason: .reason, data: (.metadata.annotations."ark.mckinsey.com/event-data" | fromjson)}'
```

#### Resource-Specific Events
```bash
# Query execution monitoring
kubectl describe query my-query

# Agent execution details  
kubectl describe agent my-agent

# Model resolution status
kubectl describe model my-model
```

#### Real-Time Monitoring
```bash
# Watch all events live
kubectl get events --watch

# Watch specific resource type
kubectl get events --watch --field-selector involvedObject.kind=Query

# Monitor with filtering
kubectl get events --watch --field-selector reason!=Pulled,reason!=Created
```

### Event Filtering and Analysis

#### Common Event Types

| Event Type | Verbosity | Description |
|------------|-----------|-------------|
| `QueryExecutionStart` | 0 | Query execution begins |
| `QueryExecutionComplete` | 0 | Query execution succeeds |
| `QueryExecutionError` | 0 | Query execution fails |
| `AgentExecutionStart` | 1 | Agent begins execution |
| `AgentExecutionComplete` | 1 | Agent completes execution |
| `AgentExecutionError` | 1 | Agent execution fails |
| `LLMCallStart` | 2 | LLM API call begins |
| `LLMCallComplete` | 2 | LLM API call completes |
| `ToolCallStart` | 1 | Tool invocation begins |
| `ToolCallComplete` | 1 | Tool invocation completes |
| `ToolCallError` | 1 | Tool invocation fails |
| `TeamExecutionStart` | 1 | Team execution begins |
| `TeamExecutionComplete` | 1 | Team execution completes |

#### Event Metadata Structure

Events with structured data store it in the `ark.mckinsey.com/event-data` annotation as JSON. The structure varies by operation type but commonly includes:

**Query Events:**
```json
{
  "queryId": "uuid",
  "queryName": "my-query",
  "queryNamespace": "default",
  "sessionId": "session-uuid",
  "timestamp": "2025-11-25T12:00:00Z",
  "durationMs": "1234.56"
}
```

**Tool Events:**
```json
{
  "toolName": "get-weather",
  "toolType": "http",
  "toolId": "call_abc123",
  "parameters": "{\"city\":\"Chicago\"}",
  "queryId": "uuid",
  "sessionId": "session-uuid",
  "timestamp": "2025-11-25T12:00:01Z",
  "durationMs": "245.12"
}
```

**Agent Events:**
```json
{
  "agentName": "weather-agent",
  "queryId": "uuid",
  "sessionId": "session-uuid",
  "timestamp": "2025-11-25T12:00:00Z",
  "durationMs": "3456.78"
}
```

### Troubleshooting Guide

#### Common Issues

**No Events Visible**
- Check verbosity level: `kubectl logs deployment/ark-controller | grep "verbosity"`
- Verify RBAC permissions for event creation
- Ensure resources are being processed: `kubectl get queries,agents,models`

**Missing Detailed Events**  
- Increase verbosity level in deployment configuration
- Check log level: `kubectl logs deployment/ark-controller | head -10`

**Too Many Events**
- Reduce verbosity level to 0 or 1 for production
- Use event filtering: `kubectl get events --field-selector reason!=EventType`

#### Performance Considerations

- **Level 0-1**: Minimal performance impact, suitable for production
- **Level 2**: Moderate impact, adds LLM call tracking overhead  
- **Level 3**: High impact, includes response content serialization

#### Security Considerations

- **Level 3 logs contain sensitive data** from LLM responses
- Use appropriate RBAC to restrict access to events
- Consider log retention policies for sensitive environments
- Monitor event storage consumption in cluster

## Integration with Monitoring Systems

### Prometheus Metrics

Events can be scraped and converted to metrics:

```yaml
# Example ServiceMonitor for event-based metrics
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: ark-events
spec:
  selector:
    matchLabels:
      app: ark-controller
  endpoints:
  - port: metrics
```

### Log Aggregation

Events are structured JSON suitable for log aggregation:

```bash
# Export events for analysis
kubectl get events -o json | jq '.items[] | select(.reason | startswith("QueryExecution"))'

# Extract structured event data from annotations
kubectl get events -o json | jq -r '.items[] | select(.metadata.annotations."ark.mckinsey.com/event-data") | {
  reason: .reason,
  involvedObject: .involvedObject.name,
  data: (.metadata.annotations."ark.mckinsey.com/event-data" | fromjson)
}'
```

### Alerting

Create alerts based on event patterns:

```yaml
# Example alert for query failures
- alert: QueryExecutionFailure
  expr: increase(kubernetes_events_total{reason="QueryExecutionError"}[5m]) > 0
  labels:
    severity: warning
  annotations:
    summary: "Query execution failing"
```