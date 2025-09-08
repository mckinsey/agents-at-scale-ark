import {
  Bot,
  Lock,
  Users,
  Zap,
  Search,
  Server,
  Wrench,
  Settings,
  CheckCircle,
  BarChart,
  Calendar,
  Database,
  type LucideIcon
} from "lucide-react";

export interface DashboardSection {
  key: string;
  title: string;
  icon: LucideIcon;
  group: "configurations" | "operations" | "runtime";
}

export const DASHBOARD_SECTIONS: Record<string, DashboardSection> = {
  // Configurations - order: Agents, Teams, Models, Secrets
  agents: {
    key: "agents",
    title: "Agents",
    icon: Bot,
    group: "configurations"
  },
  teams: {
    key: "teams",
    title: "Teams",
    icon: Users,
    group: "configurations"
  },
  models: {
    key: "models",
    title: "Models",
    icon: Zap,
    group: "configurations"
  },
  secrets: {
    key: "secrets",
    title: "Secrets",
    icon: Lock,
    group: "configurations"
  },
  evaluators: {
    key: "evaluators",
    title: "Evaluators",
    icon: CheckCircle,
    group: "configurations"
  },

  // Operations
  queries: {
    key: "queries",
    title: "Queries",
    icon: Search,
    group: "operations"
  },
  evaluations: {
    key: "evaluations",
    title: "Evaluations",
    icon: BarChart,
    group: "operations"
  },
  events: {
    key: "events",
    title: "Events",
    icon: Calendar,
    group: "operations"
  },
  memory: {
    key: "memory",
    title: "Memory",
    icon: Database,
    group: "operations"
  },

  // Runtime
  tools: {
    key: "tools",
    title: "Tools",
    icon: Wrench,
    group: "runtime"
  },
  mcp: {
    key: "mcp",
    title: "MCP Servers",
    icon: Server,
    group: "runtime"
  },
  a2a: {
    key: "a2a",
    title: "A2A Servers",
    icon: Server,
    group: "runtime"
  },
  services: {
    key: "services",
    title: "ARK Services",
    icon: Settings,
    group: "runtime"
  }
} as const;

// Type-safe keys
export type DashboardSectionKey = keyof typeof DASHBOARD_SECTIONS;

// Helper function to get icon by section key
export function getDashboardIcon(sectionKey: DashboardSectionKey): LucideIcon {
  return DASHBOARD_SECTIONS[sectionKey]?.icon || Bot;
}

// Export individual section groups for convenience
export const CONFIGURATION_SECTIONS = Object.values(DASHBOARD_SECTIONS).filter(
  (section) => section.group === "configurations"
);

export const OPERATION_SECTIONS = Object.values(DASHBOARD_SECTIONS).filter(
  (section) => section.group === "operations"
);

export const RUNTIME_SECTIONS = Object.values(DASHBOARD_SECTIONS).filter(
  (section) => section.group === "runtime"
);
