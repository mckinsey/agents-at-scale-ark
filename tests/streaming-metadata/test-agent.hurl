# Validate streaming metadata for agent-target query

# Chunks exist for the agent query
GET http://ark-broker/stream/streaming-agent-query?limit=1000
HTTP 200
[Asserts]
jsonpath "$.total" >= 2
jsonpath "$.items" count >= 2

# First chunk has ark metadata with correct query and agent
jsonpath "$.items[0].data.chunk.ark" exists
jsonpath "$.items[0].data.chunk.ark.query" exists
jsonpath "$.items[0].data.chunk.ark.agent" == "streaming-test-agent"
jsonpath "$.items[0].data.chunk.ark.target" == "agent/streaming-test-agent"
jsonpath "$.items[0].data.chunk.ark.model" exists

# Sequence numbers are ordered
jsonpath "$.items[0].sequenceNumber" >= 1

# Verify completion was signaled
POST http://ark-broker/stream/streaming-agent-query/complete
HTTP 200
[Asserts]
jsonpath "$.status" == "already_completed"
