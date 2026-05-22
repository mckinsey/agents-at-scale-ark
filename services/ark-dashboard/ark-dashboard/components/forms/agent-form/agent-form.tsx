'use client';

import { CreateAgentForm } from './create-agent-form';
import { EditAgentForm } from './edit-agent-form';
import { AgentFormMode, type AgentFormProps } from './types';
import { ViewAgentForm } from './view-agent-form';

/**
 * Mode-aware dispatcher for the agent form.
 *
 * Each mode is implemented by a dedicated component because the three modes
 * have fundamentally different layouts and UI state:
 *
 * - CREATE: Figma 2-column form (Name/Description/Model/Tools/Prompt left, Parameters right)
 * - EDIT:   Legacy 2-column form (Prompt left, Configuration right)
 * - VIEW:   Configuration panel + embedded chat panel (with YAML toggle, agent switcher)
 *
 * Shared form state lives in the `useAgentForm` hook, which each mode calls
 * directly — only one mounts per route, so there's no duplicate fetching.
 */
export function AgentForm(props: AgentFormProps) {
  switch (props.mode) {
    case AgentFormMode.CREATE:
      return <CreateAgentForm {...props} />;
    case AgentFormMode.EDIT:
      return <EditAgentForm {...props} />;
    case AgentFormMode.VIEW:
      return <ViewAgentForm {...props} />;
  }
}
