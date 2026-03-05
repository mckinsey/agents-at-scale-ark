## ADDED Requirements

### Requirement: Per-query paginated chunk retrieval
`GET /stream/:query_name` without `?watch=true` SHALL return a paginated JSON response containing only chunks for the specified query, using the same `PaginatedList` envelope as other broker endpoints.

#### Scenario: Retrieve chunks for a specific query
- **WHEN** a client sends `GET /stream/my-query`
- **THEN** the response is JSON with `items` (array of broker items filtered to `my-query`), `total` (count of chunks for that query), `hasMore`, and optional `nextCursor`

#### Scenario: Pagination parameters work
- **WHEN** a client sends `GET /stream/my-query?limit=5&cursor=10`
- **THEN** the response contains at most 5 items with sequence numbers greater than 10, all belonging to `my-query`

#### Scenario: Empty query returns empty list
- **WHEN** a client sends `GET /stream/nonexistent-query`
- **THEN** the response is `200` with `items: []` and `total: 0`

### Requirement: SSE mode preserved with watch parameter
`GET /stream/:query_name?watch=true` SHALL continue to return an SSE stream, preserving existing behavior.

#### Scenario: Watch parameter enables SSE
- **WHEN** a client sends `GET /stream/my-query?watch=true`
- **THEN** the response has `Content-Type: text/event-stream` and streams chunks via SSE
