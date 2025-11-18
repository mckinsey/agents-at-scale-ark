// ARK annotation prefix - mirrors ark/internal/annotations/annotations.go
const ARK_PREFIX = 'ark.mckinsey.com/';

// Query annotation constants for metadata.queryAnnotations
export const QUERY_ANNOTATIONS = {
  // A2A context ID annotation
  A2A_CONTEXT_ID: `${ARK_PREFIX}a2a-context-id`,
  
  // Session ID annotation (not prefixed, used directly in queryAnnotations)
  SESSION_ID: 'sessionId',
} as const;

