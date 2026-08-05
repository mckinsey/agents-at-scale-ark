## ADDED Requirements

### Requirement: Attach local files to a chat message

The chat input SHALL provide an "attach file" control that opens a file picker restricted to images (`image/png`, `image/jpeg`, `image/gif`, `image/webp`) and PDF (`application/pdf`). Selected files SHALL appear as removable chips - a thumbnail for images, a document chip with filename for PDFs - and SHALL be validated client-side against a MIME allowlist, a per-file size cap, a total-size cap, and a maximum attachment count. A file that fails validation SHALL be rejected with a visible error and SHALL NOT be attached.

#### Scenario: Attaching a supported image

- **WHEN** the user picks a PNG within the size cap via the attach-file control
- **THEN** the image appears as a removable thumbnail chip in the chat input
- **AND** it is queued to send with the next message

#### Scenario: Rejecting an unsupported or oversized file

- **WHEN** the user picks a file whose type is outside the allowlist, or whose size exceeds the per-file or total cap, or that would exceed the maximum count
- **THEN** the file is not attached
- **AND** an error is shown explaining why

#### Scenario: Removing an attachment before sending

- **WHEN** the user activates the remove control on an attachment chip
- **THEN** that attachment is removed from the pending message
- **AND** remaining attachments are unaffected

### Requirement: Attach a file from the file gateway

The chat input SHALL provide a way to attach a file already stored in the file gateway, reusing the existing file-gateway browse UI. The picker SHALL let the user navigate the gateway and select an image or PDF; the selected file's bytes SHALL be resolved and attached in the same form as a local attachment. A selected gateway file whose type is outside the allowlist SHALL be rejected.

#### Scenario: Picking a PDF from the gateway

- **WHEN** the user opens the gateway picker and selects a PDF stored in the gateway
- **THEN** the PDF is attached as a removable chip alongside any local attachments
- **AND** it is sent with the next message like a local attachment

#### Scenario: Gateway file of an unsupported type

- **WHEN** the user selects a gateway file whose type is not an allowed image or PDF
- **THEN** the file is not attached
- **AND** an error is shown

### Requirement: Send chat messages with multimodal content

When a message has one or more attachments, the dashboard SHALL send the query as a messages-array input (`type: "messages"`) containing a single user message whose `content` is an array combining the typed text (if any) with an `image_url` part per image and a `file` part per PDF. A message with no attachments SHALL continue to send as the plain-string input it does today. An attachment-only message (no text) SHALL be sendable.

#### Scenario: Message with text and an image

- **WHEN** the user sends a message containing text and one attached image
- **THEN** the query input is a messages array with one user message whose content combines a text part and an image content part

#### Scenario: Attachment-only message

- **WHEN** the user sends a message with an attachment and no text
- **THEN** the message is sent
- **AND** the query input contains the attachment content part with no requirement for text

#### Scenario: Plain text message is unchanged

- **WHEN** the user sends a message with no attachments
- **THEN** the query is sent as the existing plain-string input

### Requirement: Render attachments in the user's chat turn

The chat message list SHALL render a user turn's attachments - image thumbnails and PDF chips - for both the optimistic (pending) message and the persisted message read back from the conversation. The pending/persisted deduplication SHALL match on a text projection of the message content so that a turn carrying attachments is deduplicated rather than duplicated.

#### Scenario: Attachment shown optimistically and after persistence

- **WHEN** a user sends a message with an image and the message is later read back from the conversation
- **THEN** the attachment renders in the user's turn in both the optimistic and persisted states
- **AND** the turn is shown once, not duplicated
