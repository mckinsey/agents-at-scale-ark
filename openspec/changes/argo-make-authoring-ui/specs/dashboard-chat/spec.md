## ADDED Requirements

### Requirement: Collapsible fenced code blocks in assistant messages

The shared chat renderer (`renderMarkdown` / `ChatMessage`) SHALL render each fenced code block in an assistant message inside a collapsible container with a header row showing the block's language label and a chevron toggle. Activating the toggle SHALL hide or reveal the code body without affecting any other block. Collapse state SHALL be per-block UI state held in the browser; it SHALL NOT alter the message content, the text sent to the agent, or any draft buffer the chat feeds. The enhancement SHALL be available wherever the chat component is used (floating chat, sessions, and the argo-make authoring route).

#### Scenario: Code block renders with a collapse toggle

- **WHEN** an assistant message containing a fenced code block is rendered
- **THEN** the block shows a header with its language label and a chevron toggle
- **AND** activating the toggle hides or reveals that block's code body

#### Scenario: Toggling one block does not affect others

- **WHEN** a message contains multiple fenced code blocks
- **AND** the user toggles one block
- **THEN** only that block's collapse state changes

#### Scenario: Collapse state does not change content

- **WHEN** the user collapses or expands a code block
- **THEN** the message content, the agent input, and any draft buffer are unchanged

### Requirement: Default collapse state is opt-in

The renderer SHALL accept a default-collapse setting threaded from `ChatMessage`. When the setting is absent, code blocks SHALL render expanded, preserving existing behaviour wherever the chat component is already used. A consumer MAY set the default to collapsed for its own usage; the user SHALL still be able to expand any block manually. The change SHALL be additive and backward-compatible — no caller is required to pass the setting.

#### Scenario: Default is expanded when unset

- **WHEN** a consumer renders chat messages without specifying a default-collapse setting
- **THEN** fenced code blocks render expanded

#### Scenario: Consumer opts into default-collapsed

- **WHEN** a consumer sets the default-collapse setting to collapsed
- **THEN** fenced code blocks in assistant messages render collapsed by default
- **AND** the user can expand any block manually
