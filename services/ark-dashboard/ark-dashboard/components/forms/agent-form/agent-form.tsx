'use client';

import { CreateAgentForm } from './create-agent-form';
import { AgentFormMode, type AgentFormProps } from './types';
import { ViewAgentForm } from './view-agent-form';

/**
 * Mode-aware dispatcher for the agent form.
 *
 * - CREATE: Figma 2-column form (Name/Description/Model/Tools/Prompt left, Parameters right)
 * - EDIT / VIEW: Configuration panel + embedded chat panel (the studio, with YAML
 *   toggle and agent switcher). Editing an existing agent happens in the studio.
 *
 * Shared form state lives in the `useAgentForm` hook, which each mode calls
 * directly — only one mounts per route, so there's no duplicate fetching.
 */
export function AgentForm(props: Readonly<AgentFormProps>) {
  switch (props.mode) {
    case AgentFormMode.CREATE:
      return <CreateAgentForm {...props} />;
    case AgentFormMode.EDIT:
    case AgentFormMode.VIEW:
      return <ViewAgentForm {...props} />;
  }
}
