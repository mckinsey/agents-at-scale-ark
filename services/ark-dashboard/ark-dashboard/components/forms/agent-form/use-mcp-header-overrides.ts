'use client';

import { useCallback, useRef, useState } from 'react';

import type { AgentOverride } from '@/lib/services';
import {
  EMPTY_MCP_HEADER_OVERRIDES,
  type HeaderNamesForServer,
  type McpHeaderOverridesState,
  type McpHeaderRow,
  type McpHeaderRowError,
  buildMcpOverrides,
  createMcpHeaderRow,
  removeServerRows,
  splitMcpOverrides,
  validateMcpHeaderRows,
} from '@/lib/utils/mcp-header-overrides';

export function useMcpHeaderOverrides() {
  const [state, setState] = useState<McpHeaderOverridesState>(
    EMPTY_MCP_HEADER_OVERRIDES,
  );
  const [errors, setErrors] = useState<Record<string, McpHeaderRowError>>({});
  const previousServersRef = useRef<string[] | null>(null);
  const [loadVersion, setLoadVersion] = useState(0);

  const load = useCallback((overrides: AgentOverride[] | null | undefined) => {
    const loaded = splitMcpOverrides(overrides);
    previousServersRef.current = null;
    setLoadVersion(version => version + 1);
    setState(loaded);
    setErrors({});
    return JSON.stringify(buildMcpOverrides(loaded));
  }, []);

  const reconcile = useCallback((serverNames: string[]) => {
    const removedServers = (previousServersRef.current ?? []).filter(
      serverName => !serverNames.includes(serverName),
    );
    previousServersRef.current = serverNames;

    setState(prev => {
      const rows = removeServerRows(prev.rows, removedServers);
      return rows === prev.rows ? prev : { ...prev, rows };
    });
  }, []);

  const addRow = useCallback(() => {
    setState(prev => ({ ...prev, rows: [...prev.rows, createMcpHeaderRow()] }));
  }, []);

  const updateRow = useCallback(
    (id: string, updates: Partial<McpHeaderRow>) => {
      setState(prev => ({
        ...prev,
        rows: prev.rows.map(row =>
          row.id === id ? { ...row, ...updates } : row,
        ),
      }));
      setErrors(prev => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },
    [],
  );

  const removeRow = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      rows: prev.rows.filter(row => row.id !== id),
    }));
    setErrors(prev => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const validate = useCallback(
    (namesForServer?: HeaderNamesForServer): AgentOverride[] | null => {
      const nextErrors = validateMcpHeaderRows(
        state.rows,
        state.lockedHeaders,
        namesForServer,
      );
      setErrors(nextErrors);
      return Object.keys(nextErrors).length > 0
        ? null
        : buildMcpOverrides(state);
    },
    [state],
  );

  const toPayload = useCallback(() => buildMcpOverrides(state), [state]);

  return {
    rows: state.rows,
    loadVersion,
    errors,
    load,
    reconcile,
    addRow,
    updateRow,
    removeRow,
    validate,
    toPayload,
  };
}

export type McpHeaderOverrides = ReturnType<typeof useMcpHeaderOverrides>;
