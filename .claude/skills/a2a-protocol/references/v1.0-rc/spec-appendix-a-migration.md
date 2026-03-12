---
source: "Agent2Agent (A2A) Protocol Specification (RC v1.0)"
authors: "Google / A2A Project (Linux Foundation)"
source_url: "https://github.com/google-a2a/A2A/blob/main/docs/specification.md"
project_url: "https://a2a-protocol.org"
license: "Apache-2.0"
---

## Appendix A. Migration & Legacy Compatibility

This appendix catalogs renamed protocol messages and objects, their legacy identifiers, and the planned deprecation/removal schedule. All legacy names and anchors MUST remain resolvable until the stated earliest removal version.

| Legacy Name                                     | Current Name                              | Earliest Removal Version | Notes                                                  |
| ----------------------------------------------- | ----------------------------------------- | ------------------------ | ------------------------------------------------------ |
| `MessageSendParams`                             | `SendMessageRequest`                      | >= 0.5.0                 | Request payload rename for clarity (request vs params) |
| `SendMessageSuccessResponse`                    | `SendMessageResponse`                     | >= 0.5.0                 | Unified success response naming                        |
| `SendStreamingMessageSuccessResponse`           | `StreamResponse`                          | >= 0.5.0                 | Shorter, binding-agnostic streaming response           |
| `SetTaskPushNotificationConfigRequest`          | `CreateTaskPushNotificationConfigRequest` | >= 0.5.0                 | Explicit creation intent                               |
| `ListTaskPushNotificationConfigSuccessResponse` | `ListTaskPushNotificationConfigsResponse` | >= 0.5.0                 | Consistent response suffix removal                     |
| `GetAuthenticatedExtendedCardRequest`           | `GetExtendedAgentCardRequest`             | >= 0.5.0                 | Removed "Authenticated" from naming                    |

Planned Lifecycle (example timeline; adjust per release strategy):

1. 0.3.x: New names introduced; legacy names documented; aliases added.
2. 0.4.x: Legacy names marked "deprecated" in SDKs and schemas; warning notes added.
3. ≥0.5.0: Legacy names eligible for removal after review; migration appendix updated.

### A.1 Legacy Documentation Anchors

Hidden anchor spans preserve old inbound links:

<!-- Legacy inbound link compatibility anchors (old spec numbering & names) -->
<span id="32-supported-transport-protocols"></span>
<span id="324-transport-extensions"></span>
<span id="35-method-mapping-and-naming-conventions"></span>
<span id="5-agent-discovery-the-agent-card"></span>
<span id="53-recommended-location"></span>
<span id="55-agentcard-object-structure"></span>
<span id="56-transport-declaration-and-url-relationships"></span>
<span id="563-client-transport-selection-rules"></span>
<span id="57-sample-agent-card"></span>
<span id="6-protocol-data-objects"></span>
<span id="61-task-object"></span>
<span id="610-taskpushnotificationconfig-object"></span>
<span id="611-json-rpc-structures"></span>
<span id="612-jsonrpcerror-object"></span>
<span id="63-taskstate-enum"></span>
<span id="69-pushnotificationauthenticationinfo-object"></span>
<span id="711-messagesendparams-object"></span>
<span id="72-messagestream"></span>
<span id="721-sendstreamingmessageresponse-object"></span>
<span id="731-taskqueryparams-object"></span>
<span id="741-listtasksparams-object"></span>
<span id="742-listtasksresult-object"></span>
<span id="751-taskidparams-object-for-taskscancel-and-taskspushnotificationconfigget"></span>
<span id="77-taskspushnotificationconfigget"></span>
<span id="771-gettaskpushnotificationconfigparams-object-taskspushnotificationconfigget"></span>
<span id="781-listtaskpushnotificationconfigparams-object-taskspushnotificationconfiglist"></span>
<span id="791-deletetaskpushnotificationconfigparams-object-taskspushnotificationconfigdelete"></span>
<span id="8-error-handling"></span>
<span id="82-a2a-specific-errors"></span>
<!-- Legacy renamed message/object name anchors -->
<span id="messagesendparams"></span>
<span id="sendmessagesuccessresponse"></span>
<span id="sendstreamingmessagesuccessresponse"></span>
<span id="settaskpushnotificationconfigrequest"></span>
<span id="listtaskpushnotificationconfigsuccessresponse"></span>
<span id="getauthenticatedextendedcardrequest"></span>
<span id="938-agentgetauthenticatedextendedcard"></span>

Each legacy span SHOULD be placed adjacent to the current object's heading (to be inserted during detailed object section edits). If an exact numeric-prefixed anchor existed (e.g., `#414-message`), add an additional span matching that historical form if known.

### A.2 Migration Guidance

Client Implementations SHOULD:

- Prefer new names immediately for all new integrations.
- Implement dual-handling where schemas/types permit (e.g., union type or backward-compatible decoder).
- Log a warning when receiving legacy-named objects after the first deprecation announcement release.

Server Implementations MAY:

- Accept both legacy and current request message forms during the overlap period.
- Emit only current form in responses (recommended) while providing explicit upgrade notes.

#### A.2.1 Breaking Change: Kind Discriminator Removed

**Version 1.0 introduces a breaking change** in how polymorphic objects are represented in the protocol. This affects `Part` types and streaming event types.

**Legacy Pattern (v0.3.x):**
Objects used an inline `kind` field as a discriminator to identify the object type:

**Example 1 - TextPart:**

```json
{
  "kind": "text",
  "text": "Hello, world!"
}
```

**Example 2 - FilePart:**

```json
{
  "kind": "file",
  "file": {
    "name": "diagram.png",
    "mimeType": "image/png",
    "fileWithBytes": "iVBORw0KGgo..."
  }
}
```

**Current Pattern (v1.0):**
Objects now use the **JSON member name** itself to identify the type. The member name acts as the discriminator, and the value structure depends on the specific type:

**Example 1 - TextPart:**

```json
{
  "text": "Hello, world!"
}
```

**Example 2 - FilePart:**

```json
{
  "raw": "iVBORw0KGgo...",
  "filename": "diagram.png",
  "mediaType": "image/png"
}
```

**Affected Types:**

1. **Part Union Types**:
   - **TextPart**:
     - **Legacy:** `{ "kind": "text", "text": "..." }`
     - **Current:** `{ "text": "..." }` (member presence acts as discriminator)
   - **FilePart**:
     - **Legacy:** `{ "kind": "file", "file": { "name": "...", "mimeType": "...", "fileWithBytes": "..." } }`
     - **Current:** `{ "raw": "...", "filename": "...", "mediaType": "..." }` (or `url` instead of `raw`)
   - **DataPart**:
     - **Legacy:** `{ "kind": "data", "data": {...} }`
     - **Current:** `{ "data": {...}, "mediaType": "application/json" }`

2. **Streaming Event Types**:
   - **TaskStatusUpdateEvent**:
     - **Legacy:** `{ "kind": "status-update", "taskId": "...", "status": {...} }`
     - **Current:** `{ "statusUpdate": { "taskId": "...", "status": {...} } }`
   - **TaskArtifactUpdateEvent**:
     - **Legacy:** `{ "kind": "artifact-update", "taskId": "...", "artifact": {...} }`
     - **Current:** `{ "artifactUpdate": { "taskId": "...", "artifact": {...} } }`

**Migration Strategy:**

For **Clients** upgrading from pre-0.3.x:

1. Update parsers to expect wrapper objects with member names as discriminators
2. When constructing requests, use the new wrapper format
3. Implement version detection based on the agent's `protocolVersions` in the `AgentCard`
4. Consider maintaining backward compatibility by detecting and handling both formats during a transition period

For **Servers** upgrading from pre-0.3.x:

1. Update serialization logic to emit wrapper objects
2. **Breaking:** The `kind` field is no longer part of the protocol and should not be emitted
3. Update deserialization to expect wrapper objects with member names
4. Ensure the `AgentCard` declares the correct `protocolVersions` (e.g., ["1.0"] or later)

**Rationale:**

This change aligns with modern API design practices and Protocol Buffers' `oneof` semantics, where the field name itself serves as the type discriminator. This approach:

- Reduces redundancy (no need for both a field name and a `kind` value)
- Aligns JSON-RPC and gRPC representations more closely
- Simplifies code generation from schema definitions
- Eliminates the need for representing inheritance structures in schema languages
- Improves type safety in strongly-typed languages

#### A.2.2 Breaking Change: Extended Agent Card Field Relocated

**Version 1.0 relocates the extended agent card capability** from a top-level field to the capabilities object for architectural consistency.

**Legacy Structure (pre-1.0):**

```json
{
  "supportsExtendedAgentCard": true,
  "capabilities": {
    "streaming": true
  }
}
```

**Current Structure (1.0+):**

```json
{
  "capabilities": {
    "streaming": true,
    "extendedAgentCard": true
  }
}
```

**Proto Changes:**

- Removed: `AgentCard.supports_extended_agent_card` (field 13)
- Added: `AgentCapabilities.extended_agent_card` (field 5)

**Migration Steps:**

For **Agent Implementations**:

1. Remove `supportsExtendedAgentCard` from top-level AgentCard
2. Add `extendedAgentCard` to `capabilities` object
3. Update validation: `agentCard.capabilities?.extendedAgentCard`

For **Client Implementations**:

1. Update capability checks: `agentCard.capabilities?.extendedAgentCard`
2. Temporary fallback (transition period):

   ```javascript
   const supported = agentCard.capabilities?.extendedAgentCard ||
                     agentCard.supportsExtendedAgentCard;
   ```

3. Remove fallback after agent ecosystem migrates

For **SDK Developers**:

1. Regenerate code from updated proto
2. Update type definitions
3. Document breaking change in release notes

**Rationale:**

All optional features enabling specific operations (`streaming`, `pushNotifications`, `stateTransitionHistory`) reside in `AgentCapabilities`. Moving `extendedAgentCard` achieves:

- Architectural consistency
- Improved discoverability
- Semantic correctness (it is a capability)

### A.3 Future Automation

Once the proto→schema generation pipeline lands, this appendix will be partially auto-generated (legacy mapping table sourced from a maintained manifest). Until then, edits MUST be manual and reviewed in PRs affecting `a2a.proto`.
