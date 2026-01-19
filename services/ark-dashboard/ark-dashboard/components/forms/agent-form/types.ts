import type { UseFormReturn } from 'react-hook-form';
import * as z from 'zod';

import type { Parameter } from '@/components/ui/parameter-editor';
import type { Agent, AgentTool, Model, Skill, Tool } from '@/lib/services';
import { kubernetesNameSchema } from '@/lib/utils/kubernetes-validation';

export const agentFormSchema = z.object({
  name: kubernetesNameSchema,
  description: z.string().optional(),
  selectedModelName: z.string().optional(),
  selectedModelNamespace: z.string().optional(),
  executionEngineName: z.string().optional(),
  prompt: z.string().optional(),
});

export type AgentFormValues = z.infer<typeof agentFormSchema>;

export const AgentFormMode = {
  CREATE: 'create',
  EDIT: 'edit',
} as const;

export type AgentFormMode = (typeof AgentFormMode)[keyof typeof AgentFormMode];

export interface AgentFormState {
  mode: AgentFormMode;
  loading: boolean;
  saving: boolean;
  agent: Agent | null;
  models: Model[];
  availableTools: Tool[];
  toolsLoading: boolean;
  selectedTools: AgentTool[];
  unavailableTools: Tool[];
  parameters: Parameter[];
  isExperimentalExecutionEngineEnabled: boolean;
}

export interface AgentFormActions {
  setParameters: (params: Parameter[]) => void;
  handleToolToggle: (tool: Tool, checked: boolean) => void;
  handleDeleteTool: (tool: Tool) => void;
  isToolSelected: (toolName: string) => boolean;
  onSubmit: (values: AgentFormValues) => Promise<void>;
}

export interface AgentFormContextValue {
  form: UseFormReturn<AgentFormValues>;
  state: AgentFormState;
  actions: AgentFormActions;
}

export interface AgentFormProps {
  mode: AgentFormMode;
  agentName?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export interface ToolSelectionSectionProps {
  availableTools: Tool[];
  toolsLoading: boolean;
  onToolToggle: (tool: Tool, checked: boolean) => void;
  isToolSelected: (toolName: string) => boolean;
  unavailableTools?: Tool[];
  onDeleteClick?: (tool: Tool) => void;
}

export interface SkillsDisplaySectionProps {
  skills: Skill[];
}

