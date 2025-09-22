# Test basic streaming operations

# Test 1: Write chunks to a new stream
POST http://ark-cluster-memory/stream/test-hurl-basic
Content-Type: application/x-ndjson
```
{"id":"chatcmpl-1","object":"chat.completion.chunk","created":1704067200,"model":"gpt-4","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}
{"id":"chatcmpl-1","object":"chat.completion.chunk","created":1704067200,"model":"gpt-4","choices":[{"index":0,"delta":{"content":" streaming"},"finish_reason":null}]}
{"id":"chatcmpl-1","object":"chat.completion.chunk","created":1704067200,"model":"gpt-4","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}
{"id":"chatcmpl-1","object":"chat.completion.chunk","created":1704067200,"model":"gpt-4","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}
```

HTTP 200

# Test 2: Check stream exists in global status
GET http://ark-cluster-memory/stream-statistics
HTTP 200
[Asserts]
jsonpath "$.queries.test-hurl-basic.total_chunks" == 4
jsonpath "$.queries.test-hurl-basic.completed" == false
jsonpath "$.queries.test-hurl-basic.chunk_types.content" == 3
jsonpath "$.queries.test-hurl-basic.chunk_types.finish_reason" == 1

# Test 3: Complete the stream
POST http://ark-cluster-memory/stream/test-hurl-basic/complete
HTTP 200
[Asserts]
jsonpath "$.status" == "completed"
jsonpath "$.query" == "test-hurl-basic"

# Test 4: Verify completion in status
GET http://ark-cluster-memory/stream-statistics
HTTP 200
[Asserts]
jsonpath "$.queries.test-hurl-basic.completed" == true
jsonpath "$.queries.test-hurl-basic.has_done_marker" == true

# Test 5: Test tool call chunks
POST http://ark-cluster-memory/stream/test-hurl-tools
Content-Type: application/x-ndjson
```
{"id":"chatcmpl-2","object":"chat.completion.chunk","created":1704067200,"model":"gpt-4","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_abc","type":"function","function":{"name":"get_weather","arguments":""}}]},"finish_reason":null}]}
{"id":"chatcmpl-2","object":"chat.completion.chunk","created":1704067200,"model":"gpt-4","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\"location\":"}}]},"finish_reason":null}]}
{"id":"chatcmpl-2","object":"chat.completion.chunk","created":1704067200,"model":"gpt-4","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"Paris\"}"}}]},"finish_reason":null}]}
{"id":"chatcmpl-2","object":"chat.completion.chunk","created":1704067200,"model":"gpt-4","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}
```

HTTP 200

# Test 6: Verify tool call chunks in status
GET http://ark-cluster-memory/stream-statistics
HTTP 200
[Asserts]
jsonpath "$.queries.test-hurl-tools.total_chunks" == 4
jsonpath "$.queries.test-hurl-tools.chunk_types.tool_calls" == 3
jsonpath "$.queries.test-hurl-tools.chunk_types.finish_reason" == 1

# Test 7: Complete tool stream
POST http://ark-cluster-memory/stream/test-hurl-tools/complete
HTTP 200
[Asserts]
jsonpath "$.status" == "completed"

# Test 8: Test non-existent stream completion (error case)
POST http://ark-cluster-memory/stream/non-existent/complete
HTTP 404
[Asserts]
jsonpath "$.error" exists

# Test 9: Clean up all streams at the end
DELETE http://ark-cluster-memory/stream
HTTP 200
[Asserts]
jsonpath "$.status" == "success"
jsonpath "$.message" == "Stream data purged"

# Test 10: Verify cleanup
GET http://ark-cluster-memory/stream-statistics
HTTP 200
[Asserts]
jsonpath "$.total_queries" == 0
jsonpath "$.queries" isEmpty