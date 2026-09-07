'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { components } from '@/lib/api/generated/types';
import { agentsService, toolsService } from '@/lib/services';
import {
  type McpHeaderRow,
  type McpOverrideGroup,
  createHeaderRow,
  describeScope,
  groupsToOverrides,
  mcpServerNamesFromTools,
  overridesToGroups,
} from '@/lib/utils/mcp-header-overrides';

type AgentOverride = components['schemas']['AgentOverride'];

export interface AgentHeaderSummary {
  id: string;
  name: string;
  scope: string;
  sourceLabel: string;
  shadowed: boolean;
}

export interface UseQueryMcpHeadersResult {
  agentHeaders: AgentHeaderSummary[];
  queryRows: McpHeaderRow[];
  serverNames: string[];
  hasAnything: boolean;
  addRow: () => void;
  updateRow: (id: string, updates: Partial<McpHeaderRow>) => void;
  removeRow: (id: string) => void;
  reset: () => void;
  toApiOverrides: () => AgentOverride[] | undefined;
}

function describeSource(row: McpHeaderRow): string {
  switch (row.source) {
    case 'secretKeyRef':
      return row.secretName && row.secretKey
        ? `${row.secretName}/${row.secretKey}`
        : 'secret';
    case 'configMapKeyRef':
      return row.configMapName && row.configMapKey
        ? `${row.configMapName}/${row.configMapKey}`
        : 'configMap';
    case 'queryParameterRef':
      return row.queryParameterName
        ? `parameter ${row.queryParameterName}`
        : 'query parameter';
    default:
      return row.value ? 'value set' : 'no value';
  }
}

export function useQueryMcpHeaders(
  name: string,
  type: string,
): UseQueryMcpHeadersResult {
  const [agentGroups, setAgentGroups] = useState<McpOverrideGroup[]>([]);
  const [queryRows, setQueryRows] = useState<McpHeaderRow[]>([]);
  const [serverNames, setServerNames] = useState<string[]>([]);

  useEffect(() => {
    if (type !== 'agent' || !name) {
      setAgentGroups([]);
      setServerNames([]);
      return;
    }

    let cancelled = false;
    Promise.all([
      agentsService.getByName(name),
      toolsService.getAll().catch(() => []),
    ])
      .then(([agent, tools]) => {
        if (cancelled) return;
        setAgentGroups(overridesToGroups(agent?.overrides));

        const agentToolNames = new Set(
          (agent?.tools ?? []).map(tool => tool.name),
        );
        setServerNames(
          mcpServerNamesFromTools(
            tools.filter(tool => agentToolNames.has(tool.name)),
          ),
        );
      })
      .catch(() => {
        if (cancelled) return;
        setAgentGroups([]);
        setServerNames([]);
      });

    return () => {
      cancelled = true;
    };
  }, [name, type]);

  const queryNames = useMemo(
    () =>
      new Set(
        queryRows
          .map(row => row.name.trim().toLowerCase())
          .filter(rowName => rowName.length > 0),
      ),
    [queryRows],
  );

  const agentHeaders = useMemo<AgentHeaderSummary[]>(
    () =>
      agentGroups.flatMap(group =>
        group.headers.map(header => ({
          id: header.id,
          name: header.name,
          scope: describeScope(group),
          sourceLabel: describeSource(header),
          shadowed: queryNames.has(header.name.trim().toLowerCase()),
        })),
      ),
    [agentGroups, queryNames],
  );

  const addRow = useCallback(() => {
    setQueryRows(prev => [...prev, createHeaderRow('secretKeyRef')]);
  }, []);

  const updateRow = useCallback((id: string, updates: Partial<McpHeaderRow>) => {
    setQueryRows(prev =>
      prev.map(row => (row.id === id ? { ...row, ...updates } : row)),
    );
  }, []);

  const removeRow = useCallback((id: string) => {
    setQueryRows(prev => prev.filter(row => row.id !== id));
  }, []);

  const reset = useCallback(() => setQueryRows([]), []);

  const toApiOverrides = useCallback(() => {
    const overrides = groupsToOverrides([
      { id: 'query', matchLabels: [], headers: queryRows },
    ]);
    return overrides.length > 0 ? overrides : undefined;
  }, [queryRows]);

  return {
    agentHeaders,
    queryRows,
    serverNames,
    hasAnything: agentHeaders.length > 0 || queryRows.length > 0,
    addRow,
    updateRow,
    removeRow,
    reset,
    toApiOverrides,
  };
}
