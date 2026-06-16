## ADDED Requirements

### Requirement: cleanKubernetesResource strips runtime fields from raw K8s objects
The `cleanKubernetesResource` function SHALL accept a raw Kubernetes resource object and return a cleaned copy with runtime-only fields removed: `status`, `managedFields`, `creationTimestamp`, `resourceVersion`, `uid`, `generation`, `selfLink`, and `deletionTimestamp` from metadata.

#### Scenario: Raw agent resource is cleaned
- **WHEN** called with a raw Kubernetes Agent object containing `status`, `metadata.managedFields`, `metadata.creationTimestamp`, `metadata.resourceVersion`, and `metadata.uid`
- **THEN** the returned object contains `apiVersion`, `kind`, `metadata` (with only `name`, `namespace`, `labels`, `annotations`), and `spec` — all runtime fields are removed

#### Scenario: Raw team resource is cleaned
- **WHEN** called with a raw Kubernetes Team object
- **THEN** the same runtime fields are stripped, preserving only the CRD manifest fields

### Requirement: Null and empty values are stripped recursively
The cleanup SHALL recursively remove `null`, `undefined`, empty string, empty array, and empty object values before serialization.

#### Scenario: Nullable fields are omitted
- **WHEN** a resource object has fields set to `null` or `undefined`
- **THEN** those fields do not appear in the output

#### Scenario: Nested null values are stripped
- **WHEN** a nested object has all null/empty fields, making the parent effectively empty
- **THEN** the parent field is also omitted from the output

#### Scenario: Valid falsy values are preserved
- **WHEN** a resource object has fields set to `0` or `false`
- **THEN** those fields are preserved in the output

### Requirement: toKubernetesYaml serializes a cleaned resource to YAML
The `toKubernetesYaml` function SHALL accept a raw Kubernetes resource object, clean it, and return a valid YAML string suitable for `kubectl apply`.

#### Scenario: Full round-trip from raw resource to YAML
- **WHEN** called with a raw Kubernetes resource
- **THEN** the returned string is valid YAML with runtime fields stripped and nulls removed

#### Scenario: Multiline strings use block scalar style
- **WHEN** a resource spec contains a `prompt` field with newline characters
- **THEN** the YAML output renders the prompt using block scalar style (`|`) with preserved line breaks

### Requirement: Agent service exposes raw resource fetching
The agent service SHALL provide a method to fetch the raw Kubernetes Agent resource via the existing `/v1/resources/apis/ark.mckinsey.com/v1alpha1/Agent/{name}` endpoint.

#### Scenario: Fetch raw agent resource
- **WHEN** `getRawResource(name)` is called on the agent service
- **THEN** it returns the raw Kubernetes object from the resources API

### Requirement: Team service exposes raw resource fetching
The team service SHALL provide a method to fetch the raw Kubernetes Team resource via the existing `/v1/resources/apis/ark.mckinsey.com/v1alpha1/Team/{name}` endpoint.

#### Scenario: Fetch raw team resource
- **WHEN** `getRawResource(name)` is called on the team service
- **THEN** it returns the raw Kubernetes object from the resources API

### Requirement: YAML view fetches on activation and re-fetches on save
The YAML view in agent and team forms SHALL fetch the raw resource when the YAML tab is first activated, and re-fetch after a successful save.

#### Scenario: YAML view shows saved state on toggle
- **WHEN** the user toggles the YAML view for an existing agent
- **THEN** the dashboard fetches the raw resource and displays the cleaned YAML

#### Scenario: YAML view updates after save
- **WHEN** the user saves changes to the agent and the YAML view is active
- **THEN** the YAML view re-fetches the raw resource and displays the updated YAML

#### Scenario: YAML view for new unsaved resource
- **WHEN** the user is creating a new agent that has not been saved yet
- **THEN** the YAML view shows an appropriate empty state or message (no resource exists to fetch)
