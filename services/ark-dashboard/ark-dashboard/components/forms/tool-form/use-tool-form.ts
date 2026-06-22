'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { toast } from '@/components/ui/sonner';
import {
  type Agent,
  type Team,
  agentsService,
  teamsService,
  toolsService,
} from '@/lib/services';
import type { ToolDetail } from '@/lib/services/tools';
import { useNamespace } from '@/providers/NamespaceProvider';

import {
  type ToolFormContextValue,
  ToolFormMode,
  type ToolFormValues,
  toolFormSchema,
} from './types';

interface UseToolFormOptions {
  mode: ToolFormMode;
  toolName?: string;
  onSuccess?: () => void;
}

function toolToFormValues(tool: ToolDetail): ToolFormValues {
  const spec = tool.spec;
  return {
    name: tool.name,
    type: spec?.type ?? '',
    description: tool.description ?? '',
    inputSchema: spec?.inputSchema
      ? JSON.stringify(spec.inputSchema, null, 2)
      : '',
    annotations: tool.annotations
      ? JSON.stringify(tool.annotations, null, 2)
      : '',
    httpUrl: spec?.http?.url ?? '',
    selectedAgent: spec?.agent?.name ?? '',
    selectedTeam: spec?.team?.name ?? '',
  };
}

export function useToolForm({
  mode,
  toolName,
  onSuccess,
}: UseToolFormOptions): ToolFormContextValue {
  const { namespace } = useNamespace();
  const isEditing = mode === ToolFormMode.EDIT;
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [tool, setTool] = useState<ToolDetail | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [teamsLoading, setTeamsLoading] = useState(false);

  const form = useForm<ToolFormValues>({
    resolver: zodResolver(toolFormSchema),
    defaultValues: {
      name: '',
      type: '',
      description: '',
      inputSchema: '',
      annotations: '',
      httpUrl: '',
      selectedAgent: '',
      selectedTeam: '',
    },
  });

  const { reset } = form;

  useEffect(() => {
    if (!isEditing || !toolName) return;
    let cancelled = false;
    const loadTool = async () => {
      setLoading(true);
      try {
        const detail = await toolsService.getDetail(toolName);
        if (cancelled) return;
        setTool(detail);
        reset(toolToFormValues(detail));
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to load tool:', error);
        setTool(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadTool();
    return () => {
      cancelled = true;
    };
  }, [isEditing, toolName, namespace, reset]);

  const selectedType = useWatch({ control: form.control, name: 'type' });

  useEffect(() => {
    if (selectedType !== 'agent') return;
    let cancelled = false;
    const loadAgents = async () => {
      setAgentsLoading(true);
      try {
        const data = await agentsService.getAll();
        if (!cancelled) setAgents(data);
      } catch (error) {
        console.error('Failed to load agents:', error);
      } finally {
        if (!cancelled) setAgentsLoading(false);
      }
    };
    loadAgents();
    return () => {
      cancelled = true;
    };
  }, [selectedType, namespace]);

  useEffect(() => {
    if (selectedType !== 'team') return;
    let cancelled = false;
    const loadTeams = async () => {
      setTeamsLoading(true);
      try {
        const data = await teamsService.getAll();
        if (!cancelled) setTeams(data);
      } catch (error) {
        console.error('Failed to load teams:', error);
      } finally {
        if (!cancelled) setTeamsLoading(false);
      }
    };
    loadTeams();
    return () => {
      cancelled = true;
    };
  }, [selectedType, namespace]);

  const onSubmit = async (values: ToolFormValues) => {
    let parsedInputSchema: Record<string, unknown> | undefined;
    let parsedAnnotations: Record<string, string> | undefined;

    try {
      if (values.inputSchema.trim())
        parsedInputSchema = JSON.parse(values.inputSchema);
    } catch {
      toast.error('Invalid Input Schema', {
        description: 'Input Schema must be valid JSON.',
      });
      return;
    }

    try {
      if (values.annotations?.trim())
        parsedAnnotations = JSON.parse(values.annotations);
    } catch {
      toast.error('Invalid Annotations', {
        description: 'Annotations must be valid JSON.',
      });
      return;
    }

    setSaving(true);
    try {
      if (isEditing && toolName) {
        await toolsService.update(toolName, {
          type: values.type.trim(),
          description: values.description.trim(),
          inputSchema: parsedInputSchema,
          annotations: parsedAnnotations,
          ...(values.type === 'http' ? { url: values.httpUrl?.trim() } : {}),
          ...(values.type === 'agent'
            ? { agent: values.selectedAgent?.trim() }
            : {}),
          ...(values.type === 'team'
            ? { team: values.selectedTeam?.trim() }
            : {}),
        });
        reset(values);
      } else {
        await toolsService.create({
          name: values.name.trim(),
          type: values.type.trim(),
          description: values.description.trim(),
          inputSchema: parsedInputSchema,
          annotations: parsedAnnotations,
          ...(values.type === 'http' ? { url: values.httpUrl?.trim() } : {}),
          ...(values.type === 'agent'
            ? { agent: values.selectedAgent?.trim() }
            : {}),
          ...(values.type === 'team'
            ? { team: values.selectedTeam?.trim() }
            : {}),
          namespace,
        });
      }
      onSuccess?.();
    } catch (error) {
      toast.error(isEditing ? 'Failed to Update Tool' : 'Failed to Create Tool', {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    } finally {
      setSaving(false);
    }
  };

  return {
    form,
    state: {
      loading,
      saving,
      tool,
      hasChanges: form.formState.isDirty,
      agents,
      teams,
      agentsLoading,
      teamsLoading,
      selectedType: selectedType ?? '',
    },
    actions: { onSubmit },
  };
}
