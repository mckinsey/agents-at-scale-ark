## ADDED Requirements

### Requirement: toKubernetesYaml produces valid CRD YAML from a resource object
The `toKubernetesYaml` function SHALL accept a resource object with `apiVersion`, `kind`, `metadata`, and `spec` fields and return a valid YAML string suitable for `kubectl apply`.

#### Scenario: Standard agent resource
- **WHEN** called with an agent resource object containing apiVersion, kind, metadata (name, namespace), and spec (description, modelRef, executionEngine, prompt, tools)
- **THEN** the returned string is valid YAML containing all provided fields in the standard CRD structure

#### Scenario: Standard team resource
- **WHEN** called with a team resource object containing apiVersion, kind, metadata, and spec (description, strategy, members, selector, graph)
- **THEN** the returned string is valid YAML containing all provided fields in the standard CRD structure

### Requirement: Null and empty values are stripped recursively
The serialization SHALL recursively remove `null`, `undefined`, empty string, empty array, and empty object values before producing YAML output.

#### Scenario: Nullable fields are omitted
- **WHEN** a resource object has fields set to `null` or `undefined`
- **THEN** those fields do not appear in the YAML output

#### Scenario: Empty arrays and objects are omitted
- **WHEN** a resource object has empty arrays `[]` or empty objects `{}`
- **THEN** those fields do not appear in the YAML output

#### Scenario: Nested null values are stripped
- **WHEN** a nested object has all null/empty fields, making the parent effectively empty
- **THEN** the parent field is also omitted from the YAML output

### Requirement: Runtime-only fields are excluded
The serialization SHALL strip fields that are not part of the CRD spec manifest: `status`, `id`, `managedFields`, `creationTimestamp`, `resourceVersion`, `uid`, `generation`.

#### Scenario: Status field is stripped
- **WHEN** a resource object includes a `status` field
- **THEN** the `status` field does not appear in the YAML output

#### Scenario: UI-only id field is stripped
- **WHEN** a resource object includes an `id` field (added for dashboard UI compatibility)
- **THEN** the `id` field does not appear in the YAML output

### Requirement: Multiline strings use YAML block scalar style
The serialization SHALL render multiline string values (e.g., prompts) using YAML block scalar style (`|`) for readability.

#### Scenario: Agent prompt with newlines
- **WHEN** a resource spec contains a `prompt` field with newline characters
- **THEN** the YAML output renders the prompt using block scalar style (`|`) with preserved line breaks

### Requirement: Agent spec builder merges form state with API data
The `buildAgentSpec` function SHALL produce a spec object by taking form-managed fields from the current form state and non-form fields from the agent API response.

#### Scenario: Form-managed fields reflect live edits
- **WHEN** the user has edited description, prompt, modelRef, executionEngine, tools, or parameters in the form
- **THEN** the YAML output reflects the current form values, not the last-saved API values

#### Scenario: Non-form fields pass through from API response
- **WHEN** the agent has `overrides`, `annotations`, or `skills` set in the API response
- **THEN** those fields appear in the YAML output with their saved values

#### Scenario: Execution engine reference is included
- **WHEN** an agent has an execution engine configured (either from form state or API response)
- **THEN** the YAML output includes an `executionEngine` field with the `name` (and optionally `namespace`)

### Requirement: Team spec builder merges form state with API data
The `buildTeamSpec` function SHALL produce a spec object by taking form-managed fields from the current form state and non-form fields from the team API response.

#### Scenario: Team members and graph reflect current state
- **WHEN** the user has modified team members or graph edges
- **THEN** the YAML output reflects the current form values

#### Scenario: All team fields appear in YAML
- **WHEN** a team has description, strategy, loops, maxTurns, members, selector, and graph configured
- **THEN** all fields appear in the YAML output
