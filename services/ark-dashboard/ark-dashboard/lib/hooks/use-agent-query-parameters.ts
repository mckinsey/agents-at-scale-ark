'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { components } from '@/lib/api/generated/types';
import { agentsService, teamsService, toolsService } from '@/lib/services';
import { extractAgentRequiredParams } from '@/lib/utils/query-parameters';

export type ApiQueryParameter = components['schemas']['QueryParameter'];

type AgentDetail = components['schemas']['AgentDetailResponse'];

const BUILT_IN_A2A_ENGINE = 'a2a';

const UNRESOLVED_TOOL_TYPES = ['custom', 'built-in'];

export interface ParameterRow {
  id: string;
  name: string;
  value: string;
  agent?: string;
}

export interface TeamAgentParameters {
  name: string;
  parameters: string[];
}

interface UseAgentQueryParametersResult {
  variant: 'agent' | 'team';
  hasParameters: boolean;
  availableParameters: string[];
  teamAgents: TeamAgentParameters[];
  rows: ParameterRow[];
  addRow: () => void;
  setRowName: (id: string, name: string) => void;
  setRowValue: (id: string, value: string) => void;
  setRowAgent: (id: string, agent: string) => void;
  removeRow: (id: string) => void;
  canAddRow: boolean;
  missingParameters: string[];
  toApiParameters: () => ApiQueryParameter[] | undefined;
  engineToolWarning: string | null;
}

function stripPrefix(name: string): string {
  return name.includes('/') ? name.split('/').pop() || name : name;
}

async function deriveEngineToolWarning(
  agent: AgentDetail | null,
): Promise<string | null> {
  const engineName = agent?.executionEngine?.name;
  if (!engineName || engineName === BUILT_IN_A2A_ENGINE) return null;

  const tools = agent?.tools || [];
  if (tools.length === 0) return null;

  const needsToolTypes = tools.some(
    tool => UNRESOLVED_TOOL_TYPES.includes(tool.type) && tool.name,
  );
  const toolTypesByName = new Map<string, string>();
  if (needsToolTypes) {
    const allTools = await toolsService.getAll().catch(() => []);
    allTools.forEach(tool => {
      if (tool.type) toolTypesByName.set(tool.name, tool.type);
    });
  }

  const dropped = tools
    .map(tool => {
      const type = UNRESOLVED_TOOL_TYPES.includes(tool.type)
        ? toolTypesByName.get(tool.name || '')
        : tool.type;
      return type && type !== 'mcp' ? `${tool.name} (${type})` : null;
    })
    .filter((entry): entry is string => entry !== null);

  if (dropped.length === 0) return null;

  return `Execution engine '${engineName}' receives only mcp tools. Not available to this agent: ${dropped.join(', ')}`;
}

async function resolveTeamMemberParameters(member: {
  name: string;
}): Promise<TeamAgentParameters> {
  const agent = await agentsService
    .getByName(stripPrefix(member.name))
    .catch(() => null);
  return {
    name: member.name,
    parameters: extractAgentRequiredParams(agent?.parameters),
  };
}

/**
 * Resolves the query parameters an agent (or a team's member agents) declares
 * via valueFrom.queryParameterRef and holds the rows a user builds to supply
 * values. For agents each row picks a variable; for teams each row picks an
 * agent and one of its variables. Shared by every chat surface so this lives in
 * one place. Query parameters are global to a query (flat name/value list), so
 * the team UI groups by agent only for clarity.
 */
export function useAgentQueryParameters(
  participantName: string | null | undefined,
  participantType: string | null | undefined,
): UseAgentQueryParametersResult {
  const isTeam = participantType === 'team';
  const [availableParameters, setAvailableParameters] = useState<string[]>([]);
  const [teamAgents, setTeamAgents] = useState<TeamAgentParameters[]>([]);
  const [rows, setRows] = useState<ParameterRow[]>([]);
  const [engineToolWarning, setEngineToolWarning] = useState<string | null>(
    null,
  );
  const rowIdCounter = useRef(0);

  const createRowId = useCallback(() => {
    rowIdCounter.current += 1;
    return `param-row-${rowIdCounter.current}`;
  }, []);

  useEffect(() => {
    if (
      !participantName ||
      (participantType && participantType !== 'agent' && participantType !== 'team')
    ) {
      setAvailableParameters([]);
      setTeamAgents([]);
      setRows([]);
      setEngineToolWarning(null);
      return;
    }

    let cancelled = false;

    if (participantType === 'team') {
      const targetName = stripPrefix(participantName);
      teamsService
        .getByName(targetName)
        .then(async team => {
          // Nested team members are not expanded for now; only agent members.
          const agentMembers = (team?.members || []).filter(
            member => member.type === 'agent',
          );
          const resolved = await Promise.all(
            agentMembers.map(resolveTeamMemberParameters),
          );
          if (cancelled) return;
          setTeamAgents(resolved.filter(entry => entry.parameters.length > 0));
          setAvailableParameters([]);
          setRows([]);
          setEngineToolWarning(null);
        })
        .catch(() => {
          if (cancelled) return;
          setTeamAgents([]);
          setAvailableParameters([]);
          setRows([]);
          setEngineToolWarning(null);
        });
      return () => {
        cancelled = true;
      };
    }

    const targetName = stripPrefix(participantName);
    agentsService
      .getByName(targetName)
      .then(async agent => {
        if (cancelled) return;
        setAvailableParameters(extractAgentRequiredParams(agent?.parameters));
        setTeamAgents([]);
        setRows([]);
        const warning = await deriveEngineToolWarning(agent);
        if (cancelled) return;
        setEngineToolWarning(warning);
      })
      .catch(() => {
        if (cancelled) return;
        setAvailableParameters([]);
        setTeamAgents([]);
        setRows([]);
        setEngineToolWarning(null);
      });
    return () => {
      cancelled = true;
    };
  }, [participantName, participantType]);

  // Total variable slots a user can fill: one row per variable for agents, and
  // one row per (agent, variable) pair for teams.
  const totalSlots = useMemo(
    () =>
      isTeam
        ? teamAgents.reduce((sum, agent) => sum + agent.parameters.length, 0)
        : availableParameters.length,
    [isTeam, teamAgents, availableParameters.length],
  );

  const canAddRow = rows.length < totalSlots;

  const addRow = useCallback(() => {
    setRows(prev => {
      if (prev.length >= totalSlots) return prev;
      return [...prev, { id: createRowId(), name: '', value: '', agent: '' }];
    });
  }, [totalSlots, createRowId]);

  const setRowName = useCallback((id: string, name: string) => {
    setRows(prev => prev.map(row => (row.id === id ? { ...row, name } : row)));
  }, []);

  const setRowValue = useCallback((id: string, value: string) => {
    setRows(prev => prev.map(row => (row.id === id ? { ...row, value } : row)));
  }, []);

  const setRowAgent = useCallback(
    (id: string, agent: string) => {
      const agentParams =
        teamAgents.find(entry => entry.name === agent)?.parameters || [];
      setRows(prev =>
        prev.map(row =>
          row.id === id
            ? {
                ...row,
                agent,
                // Reset the variable if the new agent does not declare it.
                name: agentParams.includes(row.name) ? row.name : '',
              }
            : row,
        ),
      );
    },
    [teamAgents],
  );

  const removeRow = useCallback((id: string) => {
    setRows(prev => prev.filter(row => row.id !== id));
  }, []);

  const missingParameters = useMemo(() => {
    const completed = new Set(
      rows.filter(row => row.name && row.value.trim()).map(row => row.name),
    );
    const required = isTeam
      ? Array.from(new Set(teamAgents.flatMap(agent => agent.parameters)))
      : availableParameters;
    return required.filter(name => !completed.has(name));
  }, [isTeam, teamAgents, availableParameters, rows]);

  const toApiParameters = useCallback((): ApiQueryParameter[] | undefined => {
    if (totalSlots === 0) return undefined;
    // Query parameters are global by name; if two agents share a variable name
    // they share one value (last completed row wins).
    const byName = new Map<string, string>();
    rows
      .filter(row => row.name && row.value.trim())
      .forEach(row => byName.set(row.name, row.value));
    return Array.from(byName, ([name, value]) => ({ name, value }));
  }, [totalSlots, rows]);

  return {
    variant: isTeam ? 'team' : 'agent',
    hasParameters: totalSlots > 0,
    availableParameters,
    teamAgents,
    rows,
    addRow,
    setRowName,
    setRowValue,
    setRowAgent,
    removeRow,
    canAddRow,
    missingParameters,
    toApiParameters,
    engineToolWarning,
  };
}
