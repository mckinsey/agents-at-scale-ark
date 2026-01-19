'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useAtomValue } from 'jotai';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { isExperimentalExecutionEngineEnabledAtom } from '@/atoms/experimental-features';
import type { Parameter } from '@/components/ui/parameter-editor';
import type {
  Agent,
  AgentCreateRequest,
  AgentTool,
  AgentUpdateRequest,
  Model,
  Tool,
} from '@/lib/services';
import { agentsService, modelsService, toolsService } from '@/lib/services';

import { AgentFormMode, agentFormSchema, type AgentFormValues } from './types';
import {
  transformAgentParametersToForm,
  transformFormParametersToApi,
} from './utils';

interface UseAgentFormOptions {
  mode: AgentFormMode;
  agentName?: string;
  onSuccess?: () => void;
}

export function useAgentForm({ mode, agentName, onSuccess }: UseAgentFormOptions) {
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  const [loading, setLoading] = useState(mode === AgentFormMode.EDIT);
  const [saving, setSaving] = useState(false);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [availableTools, setAvailableTools] = useState<Tool[]>([]);
  const [toolsLoading, setToolsLoading] = useState(true);
  const [selectedTools, setSelectedTools] = useState<AgentTool[]>([]);
  const [unavailableTools, setUnavailableTools] = useState<Tool[]>([]);
  const [parameters, setParameters] = useState<Parameter[]>([]);

  const isExperimentalExecutionEngineEnabled = useAtomValue(
    isExperimentalExecutionEngineEnabledAtom,
  );

  const form = useForm<AgentFormValues>({
    resolver: zodResolver(agentFormSchema),
    defaultValues: {
      name: '',
      description: '',
      selectedModelName: '__none__',
      selectedModelNamespace: '',
      executionEngineName: '',
      prompt: '',
    },
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        if (mode === AgentFormMode.EDIT && agentName) {
          const [agentData, modelsData, toolsData] = await Promise.all([
            agentsService.getByName(agentName),
            modelsService.getAll(),
            toolsService.getAll(),
          ]);

          if (!agentData) {
            toast.error('Agent not found');
            onSuccessRef.current?.();
            return;
          }

          setAgent(agentData);
          setModels(modelsData);
          setAvailableTools(toolsData);

          const missingTools = agentData.tools?.filter(
            agentTool => !toolsData.some(t => t.name === agentTool.name),
          ) as Tool[];
          setUnavailableTools(missingTools || []);
          setSelectedTools(agentData.tools || []);
          setParameters(transformAgentParametersToForm(agentData.parameters));

          form.reset({
            name: agentData.name,
            description: agentData.description || '',
            selectedModelName: agentData.modelRef?.name || '__none__',
            selectedModelNamespace: agentData.modelRef?.namespace || '',
            executionEngineName: agentData.executionEngine?.name || '',
            prompt: agentData.prompt || '',
          });
        } else {
          const [modelsData, toolsData] = await Promise.all([
            modelsService.getAll(),
            toolsService.getAll(),
          ]);
          setModels(modelsData);
          setAvailableTools(toolsData);
        }
      } catch (error) {
        toast.error(`Failed to load ${mode === AgentFormMode.EDIT ? 'agent' : 'data'}`, {
          description:
            error instanceof Error ? error.message : 'An unexpected error occurred',
        });
        if (mode === AgentFormMode.EDIT) {
          onSuccessRef.current?.();
        }
      } finally {
        setLoading(false);
        setToolsLoading(false);
      }
    };

    loadData();
  }, [mode, agentName, form]);

  const mapParametersToApi = useCallback(() => {
    return transformFormParametersToApi(parameters);
  }, [parameters]);

  const onSubmit = useCallback(
    async (values: AgentFormValues) => {
      setSaving(true);
      try {
        if (mode === AgentFormMode.CREATE) {
          const createData: AgentCreateRequest = {
            name: values.name,
            description: values.description || undefined,
            modelRef:
              values.selectedModelName &&
              values.selectedModelName !== '' &&
              values.selectedModelName !== '__none__'
                ? {
                    name: values.selectedModelName,
                    namespace: values.selectedModelNamespace || undefined,
                  }
                : undefined,
            executionEngine: values.executionEngineName
              ? { name: values.executionEngineName }
              : undefined,
            prompt: values.prompt || undefined,
            tools: selectedTools,
            parameters: mapParametersToApi(),
          };

          await agentsService.create(createData);
          toast.success('Agent created successfully');
        } else if (agent) {
          const updateData: AgentUpdateRequest = {
            description: values.description || undefined,
            modelRef:
              !agent.isA2A &&
              values.selectedModelName &&
              values.selectedModelName !== '' &&
              values.selectedModelName !== '__none__'
                ? {
                    name: values.selectedModelName,
                    namespace: values.selectedModelNamespace || undefined,
                  }
                : undefined,
            executionEngine:
              !agent.isA2A && values.executionEngineName
                ? { name: values.executionEngineName }
                : undefined,
            prompt: !agent.isA2A ? values.prompt || undefined : undefined,
            tools: agent.isA2A ? undefined : selectedTools,
            parameters: agent.isA2A ? undefined : mapParametersToApi(),
          };

          await agentsService.update(agent.name, updateData);
          toast.success('Agent updated successfully');
        }
        onSuccessRef.current?.();
      } catch (error) {
        toast.error(`Failed to ${mode} agent`, {
          description:
            error instanceof Error ? error.message : 'An unexpected error occurred',
        });
      } finally {
        setSaving(false);
      }
    },
    [mode, agent, selectedTools, mapParametersToApi],
  );

  const handleToolToggle = useCallback((tool: Tool, checked: boolean) => {
    if (checked) {
      const newTool: AgentTool = { type: 'custom', name: tool.name };
      setSelectedTools(prev => [...prev, newTool]);
    } else {
      setSelectedTools(prev => prev.filter(t => t.name !== tool.name));
    }
  }, []);

  const handleDeleteTool = useCallback((tool: Tool) => {
    setUnavailableTools(prev => prev.filter(t => t.name !== tool.name));
    setSelectedTools(prev => prev.filter(t => t.name !== tool.name));
  }, []);

  const isToolSelected = useCallback(
    (toolName: string) => selectedTools.some(t => t.name === toolName),
    [selectedTools],
  );

  return {
    form,
    state: {
      mode,
      loading,
      saving,
      agent,
      models,
      availableTools,
      toolsLoading,
      selectedTools,
      unavailableTools,
      parameters,
      isExperimentalExecutionEngineEnabled,
    },
    actions: {
      setParameters,
      handleToolToggle,
      handleDeleteTool,
      isToolSelected,
      onSubmit,
    },
  };
}

