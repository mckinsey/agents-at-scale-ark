## ADDED Requirements

### Requirement: Periodic TTL cleanup job
The system SHALL run a River periodic job that deletes Query resources whose TTL has expired.

#### Scenario: Expired queries are deleted
- **WHEN** the TTL cleanup periodic job runs
- **THEN** it queries the `resources` table for Query resources where `created_at + spec.ttl < NOW()`
- **AND** deletes each expired query from the `resources` table
- **AND** the DELETE trigger fires LISTEN/NOTIFY for each deletion

#### Scenario: Queries without TTL use default expiry
- **WHEN** a Query resource has no `spec.ttl` set (nil or omitted)
- **THEN** the cleanup job uses a default TTL of 1 hour (matching the current reconciler default)

#### Scenario: Cleanup job runs periodically
- **WHEN** the River client is started
- **THEN** a periodic job for TTL cleanup is registered with a default interval of 10 minutes

#### Scenario: Running queries are not deleted
- **WHEN** a Query resource has expired TTL but its `status.phase` is "running"
- **THEN** the cleanup job skips it (to avoid deleting actively executing queries)
