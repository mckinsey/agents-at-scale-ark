// ARK annotation prefix - mirrors ark/internal/annotations/annotations.go
const ARK_PREFIX = 'ark.mckinsey.com/';

// Query annotation constants for metadata.queryAnnotations
// Note: sessionId is passed directly in metadata, not in queryAnnotations
export const QUERY_ANNOTATIONS = {
  // A2A context ID annotation (goes to K8s annotations)
  A2A_CONTEXT_ID: `${ARK_PREFIX}a2a-context-id`,
} as const;

// Event annotation constants
export const EVENT_ANNOTATIONS = {
  // Event data annotation for structured event data
  EVENT_DATA: `${ARK_PREFIX}event-data`,
} as const;
