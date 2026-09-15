import type { UseFormReturn } from 'react-hook-form';
import * as z from 'zod';

import type { AgentListItem, Team } from '@/lib/services';
import type { ToolDetail } from '@/lib/services/tools';

export const toolFormSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    type: z.string().min(1, 'Type is required'),
    description: z.string().min(1, 'Description is required'),
    inputSchema: z.string().min(1, 'Input Schema is required'),
    annotations: z.string().optional(),
    httpUrl: z.string().optional(),
    selectedAgent: z.string().optional(),
    selectedTeam: z.string().optional(),
  })
  .refine(
    data => {
      if (data.type === 'http') {
        return data.httpUrl && data.httpUrl.trim().length > 0;
      }
      return true;
    },
    {
      message: 'URL is required for HTTP type',
      path: ['httpUrl'],
    },
  )
  .refine(
    data => {
      if (data.type === 'agent') {
        return data.selectedAgent && data.selectedAgent.trim().length > 0;
      }
      return true;
    },
    {
      message: 'Agent selection is required for Agent type',
      path: ['selectedAgent'],
    },
  )
  .refine(
    data => {
      if (data.type === 'team') {
        return data.selectedTeam && data.selectedTeam.trim().length > 0;
      }
      return true;
    },
    {
      message: 'Team selection is required for Team type',
      path: ['selectedTeam'],
    },
  );

export type ToolFormValues = z.infer<typeof toolFormSchema>;

export enum ToolFormMode {
  CREATE = 'create',
  VIEW = 'view',
}

export const TOOL_TYPE_OPTIONS: ReadonlyArray<{ value: string; label: string }> =
  [
    { value: 'http', label: 'HTTP' },
    { value: 'mcp', label: 'MCP' },
    { value: 'agent', label: 'Agent' },
    { value: 'team', label: 'Team' },
  ];

export interface ToolFormState {
  loading: boolean;
  saving: boolean;
  tool: ToolDetail | null;
  agents: AgentListItem[];
  teams: Team[];
  agentsLoading: boolean;
  teamsLoading: boolean;
  selectedType: string;
}

export interface ToolFormActions {
  onSubmit: (values: ToolFormValues) => Promise<void>;
}

export interface ToolFormContextValue {
  form: UseFormReturn<ToolFormValues>;
  state: ToolFormState;
  actions: ToolFormActions;
}

export interface ToolFormProps {
  mode: ToolFormMode;
  toolName?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}
