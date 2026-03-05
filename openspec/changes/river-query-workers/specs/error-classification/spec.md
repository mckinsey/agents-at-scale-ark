## ADDED Requirements

### Requirement: Transient errors trigger retry
The system SHALL classify certain execution errors as transient and allow River to retry them with backoff.

#### Scenario: LLM provider timeout
- **WHEN** query execution fails with a context deadline exceeded or timeout error from the LLM provider
- **THEN** the worker returns the error to River (triggering retry)
- **AND** the query `phase` remains "running"

#### Scenario: HTTP 429 rate limit
- **WHEN** query execution fails with an HTTP 429 response
- **THEN** the worker returns the error to River (triggering retry)

#### Scenario: HTTP 502/503 transient server error
- **WHEN** query execution fails with an HTTP 502 or 503 response
- **THEN** the worker returns the error to River (triggering retry)

#### Scenario: Memory service temporarily unavailable
- **WHEN** query execution fails because the memory service is unreachable
- **THEN** the worker returns the error to River (triggering retry)

### Requirement: Permanent errors cancel the job
The system SHALL classify certain execution errors as permanent and immediately cancel the River job.

#### Scenario: Target resource not found
- **WHEN** query execution fails because the target Agent/Model/Team/Tool does not exist
- **THEN** the worker cancels the River job
- **AND** the worker writes `phase: error` with the error message to the Query status

#### Scenario: Validation or input error
- **WHEN** query execution fails due to malformed input or validation failure
- **THEN** the worker cancels the River job
- **AND** the worker writes `phase: error` to the Query status

#### Scenario: Auth/RBAC failure
- **WHEN** query execution fails due to insufficient permissions (impersonation failure, forbidden)
- **THEN** the worker cancels the River job
- **AND** the worker writes `phase: error` to the Query status

### Requirement: Max retry attempts
The system SHALL set a maximum number of retry attempts for transient errors.

#### Scenario: Retries exhausted
- **WHEN** a query has been retried the maximum number of times (default: 5)
- **AND** it still fails with a transient error
- **THEN** River discards the job
- **AND** the worker writes `phase: error` to the Query status with the last error message
