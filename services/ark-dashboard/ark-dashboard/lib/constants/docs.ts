const ARK_DOCS = 'https://mckinsey.github.io/agents-at-scale-ark';
const MARKETPLACE_DOCS = 'https://mckinsey.github.io/agents-at-scale-marketplace';

export const DOCS_URLS = {
  root: `${ARK_DOCS}/`,
  agents: `${ARK_DOCS}/user-guide/agents/`,
  configurations: `${ARK_DOCS}/user-guide/configurations/`,
  events: `${ARK_DOCS}/developer-guide/logging-and-events/`,
  fileGateway: `${MARKETPLACE_DOCS}/services/file-gateway/`,
  fileGatewaySizeLimits: `${MARKETPLACE_DOCS}/services/file-gateway/#file-size-limitations`,
  memory: `${ARK_DOCS}/reference/resources/memory/`,
  models: `${ARK_DOCS}/user-guide/models/`,
  observability: `${ARK_DOCS}/developer-guide/observability/`,
  queries: `${ARK_DOCS}/user-guide/queries/`,
  teams: `${ARK_DOCS}/user-guide/teams/`,
  tools: `${ARK_DOCS}/user-guide/tools/`,
} as const;
