import type { UseFormReturn } from 'react-hook-form';
import * as z from 'zod';

import type { Parameter } from '@/components/ui/parameter-editor';
import type { Agent, AgentTool, Model, Skill, Tool } from '@/lib/services';
import { kubernetesNameSchema } from '@/lib/utils/kubernetes-validation';

export const RESPONSES_EXECUTOR = 'executor-openai-responses';
export const FILE_INPUTS_EXECUTOR = 'executor-openai-file-inputs';
export const FILE_ASSISTANT_SUFFIX = '-files';

/**
 * `<name>-files` agents created via the "Pair a file assistant" checkbox are
 * implementation details of their parent responses agent — they share creds
 * via the same Model CR and surface as the file panel in the parent's view.
 * Hide them from the agents list and selectors so they don't look like
 * top-level entities the user can pick standalone.
 */
export function isPairedFileAssistant(
  agent: { name: string; executionEngine?: { name?: string | null } | null },
  allAgents: ReadonlyArray<{
    name: string;
    executionEngine?: { name?: string | null } | null;
  }>,
): boolean {
  if (agent.executionEngine?.name !== FILE_INPUTS_EXECUTOR) return false;
  if (!agent.name.endsWith(FILE_ASSISTANT_SUFFIX)) return false;
  const parentName = agent.name.slice(0, -FILE_ASSISTANT_SUFFIX.length);
  return allAgents.some(
    a =>
      a.name === parentName && a.executionEngine?.name === RESPONSES_EXECUTOR,
  );
}

export const agentFormSchema = z.object({
  name: kubernetesNameSchema,
  description: z.string().optional(),
  selectedModelName: z.string().optional(),
  selectedModelNamespace: z.string().optional(),
  executionEngineName: z.string().optional(),
  prompt: z.string().optional(),
  pairFileAssistant: z.boolean().optional(),
});

export type AgentFormValues = z.infer<typeof agentFormSchema>;

export const AgentFormMode = {
  CREATE: 'create',
  EDIT: 'edit',
  VIEW: 'view',
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
  hasChanges: boolean;
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
  disabled?: boolean;
}

export interface SkillsDisplaySectionProps {
  skills: Skill[];
}
