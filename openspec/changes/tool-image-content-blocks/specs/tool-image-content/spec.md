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

### Requirement: Image media types are normalised
A data URL media type SHALL be reduced to its base type before it is used, because RFC 2397 permits parameters between the media type and the base64 marker and a parameter carried through would not be a media type any provider accepts.

#### Scenario: Media type carries a parameter
- **WHEN** an image content part carries `data:image/png;charset=utf-8;base64,<data>`
- **THEN** the image SHALL be carried with media type `image/png`

#### Scenario: Media type differs in case
- **WHEN** an image content part carries a media type such as `IMAGE/PNG`
- **THEN** the image SHALL be carried with media type `image/png`

#### Scenario: Media type is the informal JPEG spelling
- **WHEN** an image is carried with media type `image/jpg`
- **THEN** it SHALL be carried with media type `image/jpeg`

### Requirement: Only media types every provider accepts are carried
An image SHALL be carried only when its normalised media type is one of `image/jpeg`, `image/png`, `image/gif` or `image/webp`, the set the Anthropic and OpenAI APIs both document. An unsupported media type SHALL cause the image to be dropped rather than sent, because a provider rejects the whole request over one unusable image block.

#### Scenario: MCP tool returns an unsupported image
- **WHEN** an MCP tool result contains an `ImageContent` part whose MIME type is not a supported media type
- **THEN** no image SHALL be recorded on `ToolResult.Images`
- **AND** the tool message text SHALL note that the image was not shown to the model, so the model does not assume it saw one

#### Scenario: Data URL carries an unsupported media type
- **WHEN** an image content part carries a data URL whose media type is not supported
- **THEN** no image block SHALL be emitted for it

### Requirement: Tool images are bounded in size and count
The completions executor SHALL bound the images a tool can put in front of the model, because an unbounded image is either rejected by the provider or silently consumes the context window. Three limits apply, each configurable and each defaulting to a value inside every supported provider's documented ceiling: decoded bytes per image (`ARK_TOOL_IMAGE_MAX_BYTES`, default 5 MiB), images per tool result (`ARK_TOOL_IMAGE_MAX_PER_TOOL_CALL`, default 4), and cumulative decoded bytes across all tool calls in one turn (`ARK_TOOL_IMAGE_MAX_BYTES_PER_TURN`, default 15 MiB).

#### Scenario: Image exceeds the per-image limit
- **WHEN** an MCP tool returns an image whose decoded size exceeds the per-image limit
- **THEN** no image SHALL be recorded on `ToolResult.Images` for it
- **AND** the tool message text SHALL state its size, the limit, and that it was not shown to the model

#### Scenario: Image is exactly at the per-image limit
- **WHEN** an MCP tool returns an image whose decoded size equals the per-image limit
- **THEN** the image SHALL be carried

#### Scenario: Tool result carries more images than the per-tool-call limit
- **WHEN** an MCP tool result contains more supported images than the per-tool-call limit
- **THEN** the executor SHALL carry images up to that limit in the order returned
- **AND** the tool message text SHALL note, for each image beyond it, that the limit was reached and the image was not shown to the model

#### Scenario: Turn budget is exhausted across tool calls
- **WHEN** several tool calls in one turn return images whose cumulative decoded size exceeds the per-turn budget
- **THEN** the executor SHALL carry images while the budget allows and drop each image that would exceed the remainder
- **AND** a later, smaller image that still fits the remainder SHALL be carried
- **AND** the note for a dropped image SHALL be appended to the text of the tool message it came from

#### Scenario: Limit is overridden
- **WHEN** a limit's environment variable holds a positive integer
- **THEN** that value SHALL be used in place of the default
- **AND** an absent, non-numeric or non-positive value SHALL leave the default in force

### Requirement: Images reach OpenAI-compatible providers unchanged
The user message carrying the images SHALL be an OpenAI-format message holding one `image_url` content part per image, whose URL is a base64 data URL, so that the OpenAI and Azure providers pass the images through without provider-specific encoding.

#### Scenario: Image message sent to an OpenAI-compatible provider
- **WHEN** the conversation carries a user message built for a tool's images
- **THEN** each image SHALL appear as an `image_url` part whose URL is `data:<media type>;base64,<data>`
