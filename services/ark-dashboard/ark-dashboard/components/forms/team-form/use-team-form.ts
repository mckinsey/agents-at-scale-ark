'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import * as z from 'zod';

import type { components } from '@/lib/api/generated/types';
import type { Agent, Team, TeamMember } from '@/lib/services';
import { agentsService, teamsService } from '@/lib/services';
import { kubernetesNameSchema } from '@/lib/utils/kubernetes-validation';

import { TeamFormMode } from './types';

type GraphEdge = components['schemas']['GraphEdge'];

export const DEFAULT_SELECTOR_PROMPT = `You are in a role play game. The following roles are available:
{{.Roles}}.
Read the following conversation. Then select the next role from {{.Participants}} to play. Only return the role.
Make sure to choose the role which is best suited to respond to the most recent message.

{{.History}}

Read the above conversation. Then select the next role from {{.Participants}} to play. Only return the role.`;

export const DEFAULT_TERMINATE_PROMPT =
  'If the most recent user message has been given an adequate response, do not return a role. Instead call the terminate tool.';

const teamFormSchema = z
  .object({
    name: kubernetesNameSchema,
    description: z.string().optional(),
    strategy: z.string().min(1, 'Strategy is required'),
    loops: z.boolean(),
    maxTurns: z.string().optional(),
    selectorAgent: z.string().optional(),
    selectorPrompt: z.string().optional(),
    enableTerminateTool: z.boolean().optional(),
    terminatePrompt: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.strategy === 'sequential' && data.loops && !data.maxTurns) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Max turns is required for looping sequential teams',
        path: ['maxTurns'],
      });
    }
    if (data.strategy === 'graph' && !data.maxTurns) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Max turns is required for graph teams',
        path: ['maxTurns'],
      });
    }
    if (data.strategy === 'selector' && !data.maxTurns) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Max turns is required for selector teams',
        path: ['maxTurns'],
      });
    }
  });

export type TeamFormValues = z.infer<typeof teamFormSchema>;

interface UseTeamFormOptions {
  mode: TeamFormMode;
  teamName?: string;
  onSuccess?: () => void;
}

export function useTeamForm({ mode, teamName, onSuccess }: UseTeamFormOptions) {
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  const [loading, setLoading] = useState(
    mode === TeamFormMode.EDIT || mode === TeamFormMode.VIEW,
  );
  const [saving, setSaving] = useState(false);
  const [team, setTeam] = useState<Team | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<TeamMember[]>([]);
  const [initialMembers, setInitialMembers] = useState<TeamMember[]>([]);
  const [graphEdges, setGraphEdges] = useState<GraphEdge[]>([]);
  const [initialGraphEdges, setInitialGraphEdges] = useState<GraphEdge[]>([]);
  const [unavailableMembers, setUnavailableMembers] = useState<TeamMember[]>(
    [],
  );

  const form = useForm<TeamFormValues>({
    resolver: zodResolver(teamFormSchema),
    defaultValues: {
      name: '',
      description: '',
      strategy: 'sequential',
      loops: false,
      maxTurns: '',
      selectorAgent: '',
      selectorPrompt: '',
      enableTerminateTool: true,
      terminatePrompt: DEFAULT_TERMINATE_PROMPT,
    },
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        if (
          (mode === TeamFormMode.EDIT || mode === TeamFormMode.VIEW) &&
          teamName
        ) {
          const [teamData, agentsData] = await Promise.all([
            teamsService.getByName(teamName),
            agentsService.getAll(),
          ]);

          if (!teamData) {
            toast.error('Team not found');
            onSuccessRef.current?.();
            return;
          }

          setTeam(teamData);
          setAgents(agentsData);

          const missingMembers = teamData.members?.filter(
            teamMember => !agentsData.some(a => a.name === teamMember.name),
          ) as TeamMember[];
          setUnavailableMembers(missingMembers || []);
          setSelectedMembers(teamData.members || []);
          setInitialMembers(teamData.members || []);
          setGraphEdges(teamData.graph?.edges || []);
          setInitialGraphEdges(teamData.graph?.edges || []);

          form.reset({
            name: teamData.name,
            description: teamData.description || '',
            strategy: teamData.strategy || 'sequential',
            loops: teamData.loops ?? false,
            maxTurns: teamData.maxTurns ? String(teamData.maxTurns) : '',
            selectorAgent: teamData.selector?.agent || '',
            selectorPrompt:
              teamData.selector?.selectorPrompt ||
              (teamData.strategy === 'selector' ? DEFAULT_SELECTOR_PROMPT : ''),
            enableTerminateTool: teamData.selector?.enableTerminateTool ?? false,
            terminatePrompt:
              teamData.selector?.terminatePrompt || DEFAULT_TERMINATE_PROMPT,
          });
        } else {
          const agentsData = await agentsService.getAll();
          setAgents(agentsData);
        }
      } catch (error) {
        toast.error(
          `Failed to load ${mode === TeamFormMode.EDIT || mode === TeamFormMode.VIEW ? 'team' : 'data'}`,
          {
            description:
              error instanceof Error
                ? error.message
                : 'An unexpected error occurred',
          },
        );
        if (mode === TeamFormMode.EDIT || mode === TeamFormMode.VIEW) {
          onSuccessRef.current?.();
        }
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [mode, teamName, form]);

  const hasChanges =
    form.formState.isDirty ||
    JSON.stringify(selectedMembers) !== JSON.stringify(initialMembers) ||
    JSON.stringify(graphEdges) !== JSON.stringify(initialGraphEdges);

  const onSubmit = useCallback(
    async (values: TeamFormValues) => {
      setSaving(true);
      try {
        if (mode === TeamFormMode.VIEW && team) {
          const updatedTeam = await teamsService.updateById(team.id, {
            description: values.description || undefined,
            members: selectedMembers.length > 0 ? selectedMembers : undefined,
            strategy: values.strategy || undefined,
            loops: values.loops,
            maxTurns: values.maxTurns ? parseInt(values.maxTurns) : null,
            selector:
              values.selectorAgent ||
              values.selectorPrompt ||
              values.enableTerminateTool !== undefined ||
              values.terminatePrompt
                ? {
                    agent: values.selectorAgent || undefined,
                    selectorPrompt: values.selectorPrompt || undefined,
                    enableTerminateTool: values.enableTerminateTool,
                    terminatePrompt: values.terminatePrompt || undefined,
                  }
                : null,
            graph: graphEdges.length > 0 ? { edges: graphEdges } : null,
          });

          setTeam(updatedTeam);
          setInitialMembers(selectedMembers);
          setInitialGraphEdges(graphEdges);
          form.reset(values);
          toast.success('Team updated successfully');
        } else {
          await teamsService.create({
            name: values.name,
            description: values.description || undefined,
            members: selectedMembers,
            strategy: values.strategy,
            loops: values.loops,
            maxTurns: values.maxTurns ? parseInt(values.maxTurns) : undefined,
            selector:
              values.selectorAgent ||
              values.selectorPrompt ||
              values.enableTerminateTool !== undefined ||
              values.terminatePrompt
                ? {
                    agent: values.selectorAgent || undefined,
                    selectorPrompt: values.selectorPrompt || undefined,
                    enableTerminateTool: values.enableTerminateTool,
                    terminatePrompt: values.terminatePrompt || undefined,
                  }
                : undefined,
            graph: graphEdges.length > 0 ? { edges: graphEdges } : undefined,
          });
          onSuccessRef.current?.();
        }
      } catch (error) {
        toast.error(
          mode === TeamFormMode.VIEW
            ? 'Failed to update team'
            : 'Failed to create team',
          {
            description:
              error instanceof Error
                ? error.message
                : 'An unexpected error occurred',
          },
        );
      } finally {
        setSaving(false);
      }
    },
    [mode, team, teamName, selectedMembers, graphEdges, form],
  );

  return {
    form,
    state: {
      loading,
      saving,
      team,
      agents,
      selectedMembers,
      graphEdges,
      unavailableMembers,
      hasChanges,
    },
    actions: {
      setSelectedMembers,
      setGraphEdges,
      setUnavailableMembers,
      onSubmit,
    },
  };
}
