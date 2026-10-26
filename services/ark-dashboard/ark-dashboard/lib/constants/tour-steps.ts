export interface TourStep {
  targetId: string;
  title: string;
  message: string;
  action?: string;
  actionHref?: string;
  resource?: string;
}

export const navTargetId = (key: string) => `nav-${key || 'home'}`;

export const TOUR_STEPS: TourStep[] = [
  {
    targetId: navTargetId(''),
    title: 'Home',
    message:
      'Your platform hub. Monitor and manage your agents, teams, models, and infrastructure from one central location.',
  },
  {
    targetId: navTargetId('models'),
    title: 'Models',
    message:
      'Start by configuring an AI model provider. Your agents need a default model to run on.',
    action: 'Configure your default model',
    actionHref: '/models/new',
    resource: 'models',
  },
  {
    targetId: navTargetId('mcp'),
    title: 'MCPs',
    message:
      'Add MCP (Model Context Protocol) servers to extend your agents with external tools and data sources.',
    action: 'Add an MCP server',
    actionHref: '/mcp/new',
    resource: 'mcpservers',
  },
  {
    targetId: navTargetId('agents'),
    title: 'Agents',
    message:
      'Create autonomous AI agents with custom instructions, tools, and behaviors. This is where your AI solutions come to life.',
    action: 'Create an agent',
    actionHref: '/agents/new',
    resource: 'agents',
  },
  {
    targetId: navTargetId('teams'),
    title: 'Teams',
    message:
      'Coordinate multiple agents to work together on complex tasks. Define a mission and prompt to orchestrate their collaboration.',
    action: 'Build a team of agents',
    actionHref: '/teams/new',
    resource: 'teams',
  },
  {
    targetId: navTargetId('workflow-templates'),
    title: 'Workflows',
    message:
      'Automate multi-step processes. Chain agents and define business logic for enterprise-scale automation.',
    action: 'See my workflows',
    actionHref: '/workflow-templates',
  },
  {
    targetId: navTargetId('monitoring'),
    title: 'Monitoring',
    message:
      'Track performance, debug issues, and analyze agent behavior in real time. Essential for production deployments.',
  },
  {
    targetId: navTargetId('marketplace'),
    title: 'Marketplace',
    message:
      'Discover pre-built agents, workflows, and integrations. Accelerate development with proven patterns.',
  },
  {
    targetId: navTargetId('settings'),
    title: 'Settings',
    message:
      'Manage platform preferences, A2A servers, and secure your API keys and secrets.',
  },
];
