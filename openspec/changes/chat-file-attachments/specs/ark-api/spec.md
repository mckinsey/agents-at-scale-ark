## ADDED Requirements

### Requirement: Accept and validate multimodal query input

The queries API SHALL accept a messages-array query input in which a user message's `content` is an array of content parts including `image_url` (base64 `data:` URI or URL) and `file` (base64 `file_data` with `filename`) parts. It SHALL validate attachment parts against a MIME allowlist (`image/png`, `image/jpeg`, `image/gif`, `image/webp`, `application/pdf`), a per-attachment decoded-size cap, and a total decoded-size cap, and SHALL reject requests exceeding an overall request-size guard. Rejections SHALL return a client error explaining the violation rather than being silently dropped.

#### Scenario: Valid multimodal query is accepted

- **WHEN** a client creates a query whose input is a messages array with a user message combining a text part and an in-allowlist image part within the size caps
- **THEN** the query is created with the content parts preserved

#### Scenario: Disallowed MIME type is rejected

- **WHEN** a client submits an attachment whose MIME type is outside the allowlist
- **THEN** the request is rejected with a client error naming the disallowed type

#### Scenario: Oversized attachment is rejected

- **WHEN** an attachment or the aggregate attachments exceed the configured size cap, or the request exceeds the request-size guard
- **THEN** the request is rejected with a client error

### Requirement: Preserve list-valued message content on serialization

The queries API SHALL materialize list-valued message `content` when building the Query resource so that content parts are persisted verbatim. It SHALL NOT drop a content-part array to an empty list during request-model serialization.

#### Scenario: Content parts survive query creation

- **WHEN** a query is created with a user message whose content is an array of parts
- **THEN** the created Query resource's input contains every submitted content part in order

### Requirement: Tolerate non-text parts in query text extraction

The query search and text-extraction helpers SHALL tolerate messages whose content is a string, a list of parts, or null, extracting text from text parts and ignoring `image_url` and `file` parts without error.

#### Scenario: Search over a multimodal query

- **WHEN** a query whose input contains image and file parts is searched by text
- **THEN** the search matches on the text parts
- **AND** no error is raised by the presence of non-text parts

### Requirement: Resolve a file-gateway file into a content part

The API SHALL provide an endpoint that, given a reference to a file stored in the file gateway, fetches the file's bytes in-cluster through the existing service proxy, enforces the MIME allowlist and size cap, and returns an OpenAI content part (base64 `image_url` for images, base64 `file` for PDFs) ready to include in a query input. The endpoint SHALL authenticate the caller to ark-api and reach the gateway under the service's in-cluster identity rather than forwarding the caller's bearer token to the gateway.

#### Scenario: Gateway image resolved to an image content part

- **WHEN** a client requests resolution of a gateway-stored PNG within the size cap
- **THEN** the response is an `image_url` content part carrying the file as a base64 data URI

#### Scenario: Gateway file exceeding the cap is rejected

- **WHEN** the referenced gateway file exceeds the size cap or is outside the MIME allowlist
- **THEN** the endpoint returns a client error and no content part
