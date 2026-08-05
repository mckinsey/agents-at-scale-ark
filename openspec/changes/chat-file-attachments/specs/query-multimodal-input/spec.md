## ADDED Requirements

### Requirement: Query input carries multimodal content

A Query's `spec.input` SHALL be able to carry an OpenAI Chat-Completions-style messages array in which a user message's `content` is an array of content parts (text, `image_url`, `file`). No CRD schema change SHALL be required for this - `spec.input` is a schemaless preserved-unknown-fields field - and no admission webhook SHALL reject a Query solely because its input contains non-text content parts.

#### Scenario: Query with image content is admitted

- **WHEN** a Query is created with `spec.input` as a messages array containing an `image_url` content part
- **THEN** the Query is admitted and the input is stored verbatim

#### Scenario: No schema migration required

- **WHEN** a multimodal input is stored in `spec.input`
- **THEN** it is preserved without a CRD schema change and without field pruning

### Requirement: Defaulting and text extraction tolerate non-text content

Query defaulting, naming, and first-user-text extraction SHALL tolerate a user message whose content is entirely non-text (for example an image-only message) without erroring. Text SHALL be extracted from text parts when present; the absence of any text part SHALL be non-fatal.

#### Scenario: Image-only message does not fail defaulting

- **WHEN** a Query's first user message contains only an image part and no text
- **THEN** first-user-text extraction returns empty rather than raising
- **AND** defaulting and naming proceed without error

### Requirement: Completions executor builds multi-part messages

The completions executor SHALL construct the model request from structured input: when `spec.input` is a string it SHALL build a single text user message (current behavior); when it is a content-part array it SHALL build a multi-part user message preserving `image_url` and `file` parts. It SHALL NOT fail execution on a content-part-array input. Template and parameter resolution SHALL apply only to text parts and SHALL NOT alter base64 payloads.

#### Scenario: Content-part input reaches the model

- **WHEN** the executor runs a Query whose input is a messages array with an image part
- **THEN** it builds a multi-part user message carrying the image
- **AND** execution does not fail on the non-string input

#### Scenario: Parameters substituted only in text

- **WHEN** a multimodal input contains a text part with a parameter placeholder and an image part
- **THEN** the placeholder is resolved in the text part
- **AND** the image part's payload is unchanged

### Requirement: Providers forward image and file content

The OpenAI and Azure providers SHALL forward content parts to the model unchanged. The Anthropic provider SHALL convert `image_url` parts to Anthropic `image` blocks and `file` (PDF) parts to Anthropic `document` blocks, supporting base64 and URL sources, rather than dropping non-text content. The Bedrock provider SHALL apply the same conversion but SHALL accept base64 sources only, rejecting or pre-fetching URL sources it cannot fetch.

#### Scenario: Anthropic receives an image

- **WHEN** a Query with an image part targets an Anthropic model
- **THEN** the request to Anthropic contains an image block, not a dropped or empty message

#### Scenario: Anthropic receives a PDF

- **WHEN** a Query with a PDF `file` part targets an Anthropic model
- **THEN** the request contains a document block carrying the PDF

#### Scenario: Bedrock rejects a URL source

- **WHEN** a Query with a URL-sourced image targets a Bedrock model that cannot fetch URLs
- **THEN** the URL source is rejected or pre-fetched to base64 rather than sent as an unusable URL

### Requirement: Telemetry tolerates multi-part content

Executor telemetry and content-extraction helpers SHALL tolerate multi-part message content, recording the concatenated text of text parts and not erroring on `image_url` or `file` parts.

#### Scenario: Root input telemetry on a multimodal turn

- **WHEN** the executor records input telemetry for a user turn containing text and an image
- **THEN** the recorded input contains the text
- **AND** no error is raised by the image part
