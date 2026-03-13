## MODIFIED Requirements

### Requirement: Backward-compatible metadata extraction
The handler and controller SHALL read metadata exclusively from `ExecutionContextExtensionURI`. The `ArkMetadataKey` fallback is removed.

#### Scenario: Handler reads only from extension URI key
- **WHEN** the inbound message metadata contains `ExecutionContextExtensionURI`
- **THEN** the handler SHALL use that key for ark metadata extraction

#### Scenario: Handler rejects messages without extension URI key
- **WHEN** the inbound message metadata does not contain `ExecutionContextExtensionURI`
- **THEN** the handler SHALL return an error indicating missing extension metadata

#### Scenario: Controller reads only from extension URI key
- **WHEN** the response message metadata contains `ExecutionContextExtensionURI`
- **THEN** the controller SHALL use that key for response metadata extraction

#### Scenario: Controller ignores legacy ArkMetadataKey
- **WHEN** the response message metadata contains only `ArkMetadataKey`
- **THEN** the controller SHALL NOT extract response metadata from that key

## REMOVED Requirements

### Requirement: Legacy ArkMetadataKey dual-write
**Reason**: Replaced by `ExecutionContextExtensionURI` as the sole metadata channel after engine conformance validation.
**Migration**: All execution engines must write metadata under `ExecutionContextExtensionURI` before this change is applied. Engines still writing only `ArkMetadataKey` will not have their metadata read by the controller.
