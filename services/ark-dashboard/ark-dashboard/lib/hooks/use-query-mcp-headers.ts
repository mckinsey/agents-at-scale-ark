'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { type Agent, type AgentOverride, toolsService } from '@/lib/services';
import { useGetAllMcpServers } from '@/lib/services/mcp-servers-hooks';
import {
  MCP_SERVER_TARGET_ISSUE_MESSAGES,
  type McpHeaderRow,
  agentMcpHeaders,
  buildQueryMcpOverrides,
  createMcpHeaderRow,
  getServerTargetIssue,
  headerNameOptions,
  isBlankMcpHeaderRow,
  mcpServerNamesFromTools,
  serverHeaderNames,
  validateMcpHeaderRows,
} from '@/lib/utils/mcp-header-overrides';
import { useNamespace } from '@/providers/NamespaceProvider';

export function useQueryMcpHeaders(agent: Agent | null) {
  const { namespace } = useNamespace();
  const { data: mcpServers } = useGetAllMcpServers();
  const [toolServerNames, setToolServerNames] = useState<string[]>([]);
  const [rows, setRows] = useState<McpHeaderRow[]>([]);

  const agentHeaders = useMemo(
    () => agentMcpHeaders(agent?.overrides),
    [agent],
  );

  const headerNamesByServer = useMemo(
    () =>
      Object.fromEntries(
        (mcpServers ?? []).map(server => [
          server.name,
          server.header_names ?? [],
        ]),
      ),
    [mcpServers],
  );

  const agentName = agent?.name;
  const agentToolKey = useMemo(
    () =>
      (agent?.tools ?? [])
        .flatMap(tool => (tool.name ? [tool.name] : []))
        .sort((a, b) => a.localeCompare(b))
        .join('\n'),
    [agent],
  );

  useEffect(() => {
    setRows([]);
  }, [agentName]);

  useEffect(() => {
    setToolServerNames([]);
    const agentToolNames = new Set(
      agentToolKey ? agentToolKey.split('\n') : [],
    );
    if (agentToolNames.size === 0 || !namespace) return;

    let cancelled = false;
    toolsService
      .getAll(namespace)
      .catch(() => [])
      .then(tools => {
        if (cancelled) return;
        setToolServerNames(
          mcpServerNamesFromTools(
            tools.filter(tool => agentToolNames.has(tool.name)),
          ),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [agentToolKey, namespace]);

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

  const serverIssueFor = useCallback(
    (serverName: string) => {
      const server = mcpServers?.find(entry => entry.name === serverName);
      if (!server) return undefined;
      const issue = getServerTargetIssue(server, mcpServers);
      return issue ? MCP_SERVER_TARGET_ISSUE_MESSAGES[issue] : undefined;
    },
    [mcpServers],
  );

  const errors = useMemo(
    () => validateMcpHeaderRows(rows, [], namesForServer, serverIssueFor),
    [rows, namesForServer, serverIssueFor],
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
    visible: agent !== null && (serverNames.length > 0 || rows.length > 0),
    rows,
    nameOptionsFor,
    namesForServer,
    serverIssueFor,
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
