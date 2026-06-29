'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { components } from '@/lib/api/generated/types';
import { agentsService, teamsService } from '@/lib/services';
import { extractAgentRequiredParams } from '@/lib/utils/query-parameters';

export type ApiQueryParameter = components['schemas']['QueryParameter'];

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
}

function stripPrefix(name: string): string {
  return name.includes('/') ? name.split('/').pop() || name : name;
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
            agentMembers.map(async member => {
              const agent = await agentsService
                .getByName(stripPrefix(member.name))
                .catch(() => null);
              return {
                name: member.name,
                parameters: extractAgentRequiredParams(agent?.parameters),
              };
            }),
          );
          if (cancelled) return;
          setTeamAgents(resolved.filter(entry => entry.parameters.length > 0));
          setAvailableParameters([]);
          setRows([]);
        })
        .catch(() => {
          if (cancelled) return;
          setTeamAgents([]);
          setAvailableParameters([]);
          setRows([]);
        });
      return () => {
        cancelled = true;
      };
    }

    const targetName = stripPrefix(participantName);
    agentsService
      .getByName(targetName)
      .then(agent => {
        if (cancelled) return;
        setAvailableParameters(extractAgentRequiredParams(agent?.parameters));
        setTeamAgents([]);
        setRows([]);
      })
      .catch(() => {
        if (cancelled) return;
        setAvailableParameters([]);
        setTeamAgents([]);
        setRows([]);
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
      setRows(prev =>
        prev.map(row => {
          if (row.id !== id) return row;
          const agentParams =
            teamAgents.find(entry => entry.name === agent)?.parameters || [];
          // Reset the variable if the new agent does not declare it.
          const name = agentParams.includes(row.name) ? row.name : '';
          return { ...row, agent, name };
        }),
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
  };
}
