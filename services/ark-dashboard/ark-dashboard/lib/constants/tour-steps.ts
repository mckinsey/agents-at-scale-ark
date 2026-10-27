interface TourAction {
  action: string;
  actionHref: string;
  resource?: string;
}

export interface TourStep extends Partial<TourAction> {
  targetId: string;
  title: string;
  message: string;
}

export const navTargetId = (key: string) => `nav-${key || 'home'}`;

const step = (
  key: string,
  title: string,
  message: string,
  tourAction?: TourAction,
): TourStep => ({ targetId: navTargetId(key), title, message, ...tourAction });

const createAction = (
  action: string,
  key: string,
  resource: string,
): TourAction => ({ action, actionHref: `/${key}/new`, resource });

export const TOUR_STEPS: TourStep[] = [
  step(
    '',
    'Home',
    'Your platform hub. Monitor and manage your agents, teams, models, and infrastructure from one central location.',
  ),
  step(
    'models',
    'Models',
    'Start by configuring an AI model provider. Your agents need a default model to run on.',
    createAction('Configure your default model', 'models', 'models'),
  ),
  step(
    'mcp',
    'MCPs',
    'Add MCP (Model Context Protocol) servers to extend your agents with external tools and data sources.',
    createAction('Add an MCP server', 'mcp', 'mcpservers'),
  ),
  step(
    'agents',
    'Agents',
    'Create autonomous AI agents with custom instructions, tools, and behaviors. This is where your AI solutions come to life.',
    createAction('Create an agent', 'agents', 'agents'),
  ),
  step(
    'teams',
    'Teams',
    'Coordinate multiple agents to work together on complex tasks. Define a mission and prompt to orchestrate their collaboration.',
    createAction('Build a team of agents', 'teams', 'teams'),
  ),
  step(
    'workflow-templates',
    'Workflows',
    'Automate multi-step processes. Chain agents and define business logic for enterprise-scale automation.',
    { action: 'See my workflows', actionHref: '/workflow-templates' },
  ),
  step(
    'monitoring',
    'Monitoring',
    'Track performance, debug issues, and analyze agent behavior in real time. Essential for production deployments.',
  ),
  step(
    'marketplace',
    'Marketplace',
    'Discover pre-built agents, workflows, and integrations. Accelerate development with proven patterns.',
  ),
  step(
    'settings',
    'Settings',
    'Manage platform preferences, A2A servers, and secure your API keys and secrets.',
  ),
];
