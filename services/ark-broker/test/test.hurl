# Test basic streaming operations

# Test 1: Write chunks to a new stream
POST http://ark-broker/stream/test-hurl-basic
Content-Type: application/x-ndjson
```
{"id":"chatcmpl-1","object":"chat.completion.chunk","created":1704067200,"model":"gpt-4","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}
{"id":"chatcmpl-1","object":"chat.completion.chunk","created":1704067200,"model":"gpt-4","choices":[{"index":0,"delta":{"content":" streaming"},"finish_reason":null}]}
{"id":"chatcmpl-1","object":"chat.completion.chunk","created":1704067200,"model":"gpt-4","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}
{"id":"chatcmpl-1","object":"chat.completion.chunk","created":1704067200,"model":"gpt-4","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}
```

HTTP 200

# Test 2: Check stream exists in global status
GET http://ark-broker/stream-statistics
HTTP 200
[Asserts]
jsonpath "$.queries.test-hurl-basic.total_chunks" == 4
jsonpath "$.queries.test-hurl-basic.completed" == false
jsonpath "$.queries.test-hurl-basic.chunk_types.content" == 3
jsonpath "$.queries.test-hurl-basic.chunk_types.finish_reason" == 1

# Test 3: Complete the stream
POST http://ark-broker/stream/test-hurl-basic/complete
HTTP 200
[Asserts]
jsonpath "$.status" == "completed"
jsonpath "$.query" == "test-hurl-basic"

# Test 4: Verify completion in status
GET http://ark-broker/stream-statistics
HTTP 200
[Asserts]
jsonpath "$.queries.test-hurl-basic.completed" == true
jsonpath "$.queries.test-hurl-basic.has_done_marker" == true

# Test 5: Test tool call chunks
POST http://ark-broker/stream/test-hurl-tools
Content-Type: application/x-ndjson
```
{"id":"chatcmpl-2","object":"chat.completion.chunk","created":1704067200,"model":"gpt-4","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_abc","type":"function","function":{"name":"get_weather","arguments":""}}]},"finish_reason":null}]}
{"id":"chatcmpl-2","object":"chat.completion.chunk","created":1704067200,"model":"gpt-4","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\"location\":"}}]},"finish_reason":null}]}
{"id":"chatcmpl-2","object":"chat.completion.chunk","created":1704067200,"model":"gpt-4","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"Paris\"}"}}]},"finish_reason":null}]}
{"id":"chatcmpl-2","object":"chat.completion.chunk","created":1704067200,"model":"gpt-4","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}
```

HTTP 200

# Test 6: Verify tool call chunks in status
GET http://ark-broker/stream-statistics
HTTP 200
[Asserts]
jsonpath "$.queries.test-hurl-tools.total_chunks" == 4
jsonpath "$.queries.test-hurl-tools.chunk_types.tool_calls" == 3
jsonpath "$.queries.test-hurl-tools.chunk_types.finish_reason" == 1

# Test 7: Complete tool stream
POST http://ark-broker/stream/test-hurl-tools/complete
HTTP 200
[Asserts]
jsonpath "$.status" == "completed"

# Test 8: Test non-existent stream completion (error case)
POST http://ark-broker/stream/non-existent/complete
HTTP 404
[Asserts]
jsonpath "$.error" exists

# Test 9: Clean up all streams at the end
DELETE http://ark-broker/stream
HTTP 200
[Asserts]
jsonpath "$.status" == "success"
jsonpath "$.message" == "Stream data purged"

# Test 10: Verify cleanup
GET http://ark-broker/stream-statistics
HTTP 200
[Asserts]
jsonpath "$.total_queries" == 0
jsonpath "$.queries" isEmpty

# =============================================================================
# Trace API Tests
# =============================================================================

# Test 11: List traces (initially empty)
GET http://ark-broker/traces
HTTP 200
[Asserts]
jsonpath "$" count == 0

# Test 12: Ingest trace data via OTLP
POST http://ark-broker/v1/traces
Content-Type: application/json
```
{
  "resourceSpans": [{
    "resource": {
      "attributes": [{"key": "service.name", "value": {"stringValue": "test-service"}}]
    },
    "scopeSpans": [{
      "spans": [
        {"traceId": "test-trace-1", "spanId": "span-1", "name": "query.execute"},
        {"traceId": "test-trace-1", "spanId": "span-2", "parentSpanId": "span-1", "name": "llm.chat"}
      ]
    }]
  }]
}
```
HTTP 200

# Test 13: List traces (should have one trace)
GET http://ark-broker/traces
HTTP 200
[Asserts]
jsonpath "$" count == 1
jsonpath "$[0].traceId" == "test-trace-1"
jsonpath "$[0].spans" count == 2

# Test 14: Get single trace
GET http://ark-broker/traces/test-trace-1
HTTP 200
[Asserts]
jsonpath "$.traceId" == "test-trace-1"
jsonpath "$.spans" count == 2
jsonpath "$.spans[0].spanId" == "span-1"
jsonpath "$.spans[1].spanId" == "span-2"

# Test 15: Get non-existent trace
GET http://ark-broker/traces/non-existent
HTTP 404
[Asserts]
jsonpath "$.error" == "Trace not found"

# Test 16: Ingest second trace
POST http://ark-broker/v1/traces
Content-Type: application/json
```
{
  "resourceSpans": [{
    "scopeSpans": [{
      "spans": [
        {"traceId": "test-trace-2", "spanId": "span-1", "name": "query.execute"}
      ]
    }]
  }]
}
```
HTTP 200

# Test 17: List traces with limit
GET http://ark-broker/traces?limit=1
HTTP 200
[Asserts]
jsonpath "$" count == 1
jsonpath "$[0].traceId" == "test-trace-2"

# Test 18: List traces with offset
GET http://ark-broker/traces?limit=1&offset=1
HTTP 200
[Asserts]
jsonpath "$" count == 1
jsonpath "$[0].traceId" == "test-trace-1"

# Test 19: Purge traces
DELETE http://ark-broker/traces
HTTP 200
[Asserts]
jsonpath "$.status" == "success"
jsonpath "$.message" == "Trace data purged"

# Test 20: Verify traces purged
GET http://ark-broker/traces
HTTP 200
[Asserts]
jsonpath "$" count == 0