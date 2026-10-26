## Purpose

Default-deny network egress for sandboxed agents, with a per-agent allowlist derived from the
agent's declared model and tool destinations, and model/tool credentials injected out-of-band
so they never reside inside the sandbox.

## ADDED Requirements

### Requirement: Egress allowlist derived from the agent spec

Each actor SHALL be granted egress only to the hosts implied by the agent's `modelRef` and its
`tools`/`mcpServers`. All other outbound traffic SHALL be denied by default; the allowlist
MUST be derived from the declarative spec rather than hand-maintained per task.

#### Scenario: Declared model host is reachable
- **WHEN** an agent uses a model served at host `H`
- **THEN** its actor may reach `H`, and that allowance is created automatically from the agent spec

#### Scenario: Undeclared host is denied
- **WHEN** the agent attempts to reach a host not implied by its model or tools
- **THEN** the connection is denied

### Requirement: Out-of-band credential injection

Model and tool credentials SHALL be injected into approved outbound requests by the egress
layer, not placed inside the sandbox. A compromised or prompt-injected agent MUST NOT be able
to read those credentials from its own process environment or filesystem.

#### Scenario: Credential absent from the sandbox
- **WHEN** the agent is running
- **THEN** its environment and filesystem SHALL NOT contain the model/tool API credentials

#### Scenario: Approved request is authenticated upstream
- **WHEN** the agent calls an approved model or tool endpoint
- **THEN** the request carries the injected credential and authenticates successfully

### Requirement: Explicit, non-default development egress

The system SHALL support a development mode that grants an actor broad (allow-all) egress for
local testing. This mode MUST be disabled by default and clearly identifiable as a local-dev
convenience, not a production posture.

#### Scenario: Allow-all only when explicitly enabled
- **WHEN** development egress is enabled for the environment
- **THEN** the actor may reach any host

#### Scenario: Default remains deny
- **WHEN** development egress is not enabled
- **THEN** the actor's egress remains restricted to its derived allowlist
