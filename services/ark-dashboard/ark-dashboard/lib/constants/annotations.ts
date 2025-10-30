// ARK annotation prefix - mirrors ark/internal/annotations/annotations.go
const ARK_PREFIX = 'ark.mckinsey.com/';

// TypeScript constants mirroring Go constants in ark/internal/annotations/annotations.go
export const ARK_ANNOTATIONS = {
  // Dashboard annotations
  DASHBOARD_ICON: `${ARK_PREFIX}dashboard-icon`,

  // A2A annotations
  A2A_SERVER_NAME: `${ARK_PREFIX}a2a-server-name`,
  A2A_SERVER_ADDRESS: `${ARK_PREFIX}a2a-server-address`,
  A2A_SERVER_SKILLS: `${ARK_PREFIX}a2a-server-skills`,

  // MCP annotations
  MCP_SERVER_NAME: `${ARK_PREFIX}mcp-server-name`,

  // ARK service annotations
  SERVICE: `${ARK_PREFIX}service`,
  RESOURCES: `${ARK_PREFIX}resources`,

  // Evaluation annotations
  EVALUATOR: `${ARK_PREFIX}evaluator`,
  QUERY: `${ARK_PREFIX}query`,
  AUTO: `${ARK_PREFIX}auto`,
  QUERY_GENERATION: `${ARK_PREFIX}query-generation`,
  QUERY_PHASE: `${ARK_PREFIX}query-phase`,

  // Streaming annotations
  STREAMING_ENABLED: `${ARK_PREFIX}streaming-enabled`,
} as const;
