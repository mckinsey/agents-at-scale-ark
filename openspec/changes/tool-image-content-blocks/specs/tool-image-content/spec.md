## ADDED Requirements

### Requirement: MCP image content is carried as image data
The completions executor SHALL carry an image returned by an MCP tool as image bytes on the tool result rather than serialising it into the tool message text.

#### Scenario: Tool returns an image part
- **WHEN** an MCP tool result contains an `ImageContent` part
- **THEN** the executor SHALL record the part's MIME type and raw bytes on `ToolResult.Images`
- **AND** the tool message text SHALL contain a one-line note that an image was returned, not the image's base64 encoding

#### Scenario: Tool returns text and an image
- **WHEN** an MCP tool result contains both a `TextContent` and an `ImageContent` part
- **THEN** the tool message text SHALL contain the text part
- **AND** the image SHALL be carried on `ToolResult.Images`

#### Scenario: Tool returns neither text nor an image
- **WHEN** an MCP tool result contains a content part that is neither text nor an image
- **THEN** the executor SHALL serialise it into the tool message text as before

### Requirement: Images returned by a tool are shown to the model
The completions executor SHALL append a user message carrying the images to the conversation after the tool message they came from, because the `tool` role cannot hold an image content part.

#### Scenario: Image message follows the tool message
- **WHEN** a tool call returns one or more images
- **THEN** the executor SHALL append the tool message followed by a user message holding one image content part per image and a caption naming the tool
- **AND** both messages SHALL be added to the conversation history

#### Scenario: Tool returns no image
- **WHEN** a tool call returns no image
- **THEN** the executor SHALL append only the tool message, unchanged from previous behaviour

### Requirement: Anthropic requests carry images as image blocks
The Anthropic request format SHALL express a message's content as either a JSON string or an array of content blocks, and SHALL emit an `image` block for each image the message carries.

#### Scenario: Text-only message is unchanged
- **WHEN** a message carries text and no image and is not the prompt-cache breakpoint
- **THEN** its `content` SHALL be a bare JSON string, identical to the format sent before this change

#### Scenario: Message with an image
- **WHEN** a message carries one or more images
- **THEN** its `content` SHALL be an array containing one `image` block per image, each with `source.type` `base64`, the image's media type, and its base64 data
- **AND** the text SHALL follow the images as a `text` block

#### Scenario: Image message is not dropped
- **WHEN** a message carries an image and no text
- **THEN** the message SHALL be included in the request with its image block

#### Scenario: Prompt cache breakpoint on a message with an image
- **WHEN** the message selected as the prompt-cache breakpoint carries an image
- **THEN** `cache_control` SHALL be set on the last block of that message's content array

### Requirement: Non-base64 image URLs are rejected
A message content part whose image URL is not a base64 data URL SHALL be omitted from the Anthropic request rather than passed on as text.

#### Scenario: Remote image URL
- **WHEN** a user message carries an image content part with an `https://` URL
- **THEN** no image block SHALL be emitted for it

#### Scenario: Malformed data URL
- **WHEN** an image content part carries a data URL with no media type, no base64 marker, or undecodable data
- **THEN** no image block SHALL be emitted for it
