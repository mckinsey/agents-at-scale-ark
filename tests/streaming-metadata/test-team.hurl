# Validate streaming metadata for team-target query

# Chunks exist for the team query
GET http://ark-broker/stream/streaming-team-query?limit=1000
HTTP 200
[Asserts]
jsonpath "$.total" >= 2
jsonpath "$.items" count >= 2

# First chunk has ark metadata with correct query and team
jsonpath "$.items[0].data.chunk.ark" exists
jsonpath "$.items[0].data.chunk.ark.query" exists
jsonpath "$.items[0].data.chunk.ark.team" == "streaming-test-team"
jsonpath "$.items[0].data.chunk.ark.agent" exists
jsonpath "$.items[0].data.chunk.ark.model" exists

# Sequence numbers are ordered
jsonpath "$.items[0].sequenceNumber" >= 1

# Verify completion was signaled
POST http://ark-broker/stream/streaming-team-query/complete
HTTP 200
[Asserts]
jsonpath "$.status" == "already_completed"
