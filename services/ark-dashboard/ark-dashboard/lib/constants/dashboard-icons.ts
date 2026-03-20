import {
  Activity,
  Bot,
  Calendar,
  ClipboardList,
  Cog,
  Database,
  Download,
  FileText,
  Key,
  Lock,
  type LucideIcon,
  Package,
  Play,
  Search,
  Server,
  Settings,
  Users,
  Workflow,
  Wrench,
  Zap,
} from 'lucide-react';

import {
  BROKER_FEATURE_KEY,
  EXPERIMENTAL_EXECUTION_ENGINE_FEATURE_KEY,
  FILES_BROWSER_FEATURE_KEY,
} from '@/atoms/experimental-features';

export interface DashboardSection {
  key: string;
  title: string;
  icon: LucideIcon;
  group:
    | 'configurations'
    | 'operations'
    | 'runtime'
    | 'service'
    | 'agent-builder'
    | 'workflow-templates'
    | 'monitoring';
  enablerFeature?: string;
}

export const DASHBOARD_SECTIONS: Record<string, DashboardSection> = {
  // Configurations - order: Agents, Teams, Models, Secrets
  agents: {
    key: 'agents',
    title: 'Agents',
    icon: Bot,
    group: 'agent-builder',
  },
  teams: {
    key: 'teams',
    title: 'Teams',
    icon: Users,
    group: 'agent-builder',
  },
  queries: {
    key: 'queries',
    title: 'Queries',
    icon: Search,
    group: 'agent-builder',
  },

  // Workflow Templates
  'workflow-templates': {
    key: 'workflow-templates',
    title: 'Workflows',
    icon: Workflow,
    group: 'workflow-templates',
  },

  // Models
  models: {
    key: 'models',
    title: 'Models',
    icon: Zap,
    group: 'configurations',
  },

  // Secrets
  secrets: {
    key: 'secrets',
    title: 'Secrets',
    icon: Lock,
    group: 'configurations',
  },

  // Monitoring
  sessions: {
    key: 'sessions',
    title: 'Workflow Runs',
    icon: Play,
    group: 'monitoring',
  },
  events: {
    key: 'events',
    title: 'Events',
    icon: Calendar,
    group: 'monitoring',
  },
  broker: {
    key: 'broker',
    title: 'Broker',
    icon: Activity,
    group: 'monitoring',
    enablerFeature: BROKER_FEATURE_KEY,
  },

  // Operations
  memory: {
    key: 'memory',
    title: 'Memory',
    icon: Database,
    group: 'operations',
  },
  files: {
    key: 'files',
    title: 'Files',
    icon: FileText,
    group: 'operations',
    enablerFeature: FILES_BROWSER_FEATURE_KEY,
  },
  tasks: {
    key: 'tasks',
    title: 'A2A Tasks',
    icon: ClipboardList,
    group: 'operations',
  },

  // Runtime
  tools: {
    key: 'tools',
    title: 'Tools',
    icon: Wrench,
    group: 'runtime',
  },
  mcp: {
    key: 'mcp',
    title: 'MCP Servers',
    icon: Server,
    group: 'runtime',
  },
  a2a: {
    key: 'a2a',
    title: 'A2A Servers',
    icon: Server,
    group: 'runtime',
  },
  services: {
    key: 'services',
    title: 'ARK Services',
    icon: Settings,
    group: 'runtime',
  },

  'execution-engines': {
    key: 'execution-engines',
    title: 'Execution Engines',
    icon: Cog,
    group: 'runtime',
    enablerFeature: EXPERIMENTAL_EXECUTION_ENGINE_FEATURE_KEY,
  },

  // Service
  'api-keys': {
    key: 'api-keys',
    title: 'Service API Keys',
    icon: Key,
    group: 'service',
  },
  export: {
    key: 'export',
    title: 'Exports',
    icon: Download,
    group: 'service',
  },
} as const satisfies Record<string, DashboardSection>;

// Type-safe keys
export type DashboardSectionKey = keyof typeof DASHBOARD_SECTIONS;

// Section groups used in the app
export const AGENT_BUILDER_SECTIONS = Object.values(DASHBOARD_SECTIONS).filter(
  section => section.group === 'agent-builder',
);

export const MONITORING_SECTIONS = Object.values(DASHBOARD_SECTIONS).filter(
  section => section.group === 'monitoring',
);
