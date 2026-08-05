## ADDED Requirements

### Requirement: SDK message content is multimodal and backward-compatible

The Ark SDK `Message` model SHALL allow `content` to be either a string or a list of content-part dictionaries. String content SHALL remain valid and SHALL serialize identically to today, so existing text-only executors and producers are unaffected. Unknown keys on parts SHALL be tolerated.

#### Scenario: String content still valid

- **WHEN** an executor constructs a `Message` with string content
- **THEN** the model validates and serializes exactly as before

#### Scenario: List content accepted

- **WHEN** a `Message` is constructed with a list of content parts
- **THEN** the model validates and preserves the parts

### Requirement: SDK builds multimodal user input from the query

The SDK's query resolution SHALL build the executor's `userInput.content` from the structured `spec.input` of the fetched Query when that input carries content parts, preserving image and file parts, and SHALL fall back to the plain text for a string input. Response-text extraction SHALL be list-safe: it SHALL derive text from text parts and SHALL NOT fail when a message's content is a list.

#### Scenario: Executor receives image content

- **WHEN** the SDK resolves a Query whose input contains an image content part
- **THEN** the executor's `userInput.content` is the list of parts including the image
- **AND** a string input still yields string `userInput.content`

#### Scenario: List-content response does not crash extraction

- **WHEN** response-text extraction runs over a message whose content is a list of parts
- **THEN** it returns the joined text of the text parts without error

### Requirement: Agent card advertises multimodal input modes

The SDK-built agent card SHALL advertise image and file input modes in addition to text, so callers can discover that the executor accepts attachments.

#### Scenario: Input modes include image and file

- **WHEN** the agent card is generated for an executor built on the SDK
- **THEN** its accepted input modes include image and file alongside text

### Requirement: Broker accepts multimodal message payloads

The ark-broker JSON body-size limit SHALL be raised or configurable so that messages carrying base64 image or PDF content are accepted rather than rejected before handling. Message persistence SHALL round-trip multi-part content without loss.

#### Scenario: Base64 message is stored and read back

- **WHEN** a message carrying a base64 image content part within the configured limit is posted to the broker and later read
- **THEN** it is stored and returned with its content parts intact

#### Scenario: Oversized body is bounded by configuration

- **WHEN** the configured body-size limit is set for base64 payloads
- **THEN** messages within the limit are accepted
