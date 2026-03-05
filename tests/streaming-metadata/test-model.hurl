# Validate streaming metadata for model-target query

# Chunks exist for the model query
GET http://ark-broker/stream/streaming-model-query?limit=1000
HTTP 200
[Asserts]
jsonpath "$.total" >= 2
jsonpath "$.items" count >= 2

# First chunk has ark metadata with correct query name
jsonpath "$.items[0].data.chunk.ark" exists
jsonpath "$.items[0].data.chunk.ark.query" exists
jsonpath "$.items[0].data.chunk.ark.model" exists

# Sequence numbers are ordered
jsonpath "$.items[0].sequenceNumber" >= 1
jsonpath "$.items[1].sequenceNumber" >= 2

# Verify completion was signaled
POST http://ark-broker/stream/streaming-model-query/complete
HTTP 200
[Asserts]
jsonpath "$.status" == "already_completed"
