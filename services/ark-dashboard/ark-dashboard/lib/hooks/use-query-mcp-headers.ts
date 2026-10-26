'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { AgentOverride } from '@/lib/services';
import { agentsService, mcpServersService, toolsService } from '@/lib/services';
import {
  type AgentMcpHeader,
  type McpHeaderRow,
  agentMcpHeaders,
  buildQueryMcpOverrides,
  createMcpHeaderRow,
  headerNameOptions,
  isBlankMcpHeaderRow,
  mcpServerNamesFromTools,
  serverHeaderNames,
  validateMcpHeaderRows,
} from '@/lib/utils/mcp-header-overrides';
import { useNamespace } from '@/providers/NamespaceProvider';

export function useQueryMcpHeaders(
  name: string | null | undefined,
  type: string | null | undefined,
) {
  const { namespace } = useNamespace();
  const [agentHeaders, setAgentHeaders] = useState<AgentMcpHeader[]>([]);
  const [toolServerNames, setToolServerNames] = useState<string[]>([]);
  const [headerNamesByServer, setHeaderNamesByServer] = useState<
    Record<string, string[]>
  >({});
  const [rows, setRows] = useState<McpHeaderRow[]>([]);

  useEffect(() => {
    setRows([]);
    if (type !== 'agent' || !name || !namespace) {
      setAgentHeaders([]);
      setToolServerNames([]);
      setHeaderNamesByServer({});
      return;
    }

    let cancelled = false;
    const load = async () => {
      const agent = await agentsService
        .getByName(namespace, name)
        .catch(() => null);
      const agentToolNames = new Set(
        (agent?.tools ?? []).map(tool => tool.name),
      );
      const usesTools = agentToolNames.size > 0;
      const tools = usesTools
        ? await toolsService.getAll(namespace).catch(() => [])
        : [];
      const mcpServers = usesTools
        ? await mcpServersService.getAll(namespace).catch(() => [])
        : [];
      if (cancelled) return;
      setHeaderNamesByServer(
        Object.fromEntries(
          mcpServers.map(server => [server.name, server.header_names ?? []]),
        ),
      );
      setAgentHeaders(agentMcpHeaders(agent?.overrides));
      setToolServerNames(
        mcpServerNamesFromTools(
          tools.filter(tool => agentToolNames.has(tool.name)),
        ),
      );
    };
    load();

    return () => {
      cancelled = true;
    };
  }, [name, type, namespace]);

  const serverNames = useMemo(() => {
    const names = new Set(toolServerNames);
    for (const header of agentHeaders) {
      if (header.scope.kind === 'server') names.add(header.scope.serverName);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [toolServerNames, agentHeaders]);

  const namesForServer = useCallback(
    (serverName?: string) => {
      const agentNames = agentHeaders
        .filter(
          header =>
            !serverName ||
            header.scope.kind === 'all' ||
            (header.scope.kind === 'server' &&
              header.scope.serverName === serverName),
        )
        .map(header => header.name);
      return [
        ...serverHeaderNames(serverName, serverNames, headerNamesByServer),
        ...agentNames,
      ];
    },
    [agentHeaders, serverNames, headerNamesByServer],
  );

  const errors = useMemo(
    () => validateMcpHeaderRows(rows, [], namesForServer),
    [rows, namesForServer],
  );

  const effectiveCount = rows.filter(row => !isBlankMcpHeaderRow(row)).length;

  const nameOptionsFor = useCallback(
    (row: McpHeaderRow) =>
      headerNameOptions(row, rows, namesForServer(row.serverName)),
    [rows, namesForServer],
  );

  const canAddRow =
    agentHeaders.length > 0 ||
    serverHeaderNames(undefined, serverNames, headerNamesByServer).length > 0;

  const addRow = useCallback(() => {
    setRows(prev => [...prev, createMcpHeaderRow()]);
  }, []);

  const updateRow = useCallback(
    (id: string, updates: Partial<McpHeaderRow>) => {
      setRows(prev =>
        prev.map(row => (row.id === id ? { ...row, ...updates } : row)),
      );
    },
    [],
  );

  const removeRow = useCallback((id: string) => {
    setRows(prev => prev.filter(row => row.id !== id));
  }, []);

  const toApiOverrides = useCallback((): AgentOverride[] | undefined => {
    const overrides = buildQueryMcpOverrides(rows, agentHeaders);
    return overrides.length > 0 ? overrides : undefined;
  }, [rows, agentHeaders]);

  return {
    visible: type === 'agent' && (serverNames.length > 0 || rows.length > 0),
    rows,
    nameOptionsFor,
    namesForServer,
    canAddRow,
    errors,
    hasErrors: Object.keys(errors).length > 0,
    serverNames,
    effectiveCount,
    addRow,
    updateRow,
    removeRow,
    toApiOverrides,
  };
}

export type QueryMcpHeaders = ReturnType<typeof useQueryMcpHeaders>;
