'use client';

import { useEffect, useMemo, useState } from 'react';

import { mcpServersService } from '@/lib/services';

export interface UseMcpServerHeadersResult {
  headerNamesByServer: Record<string, string[]>;
  allHeaderNames: string[];
  loaded: boolean;
}

export function useMcpServerHeaders(
  serverNames: string[],
  enabled: boolean = true,
): UseMcpServerHeadersResult {
  const serverKey = useMemo(
    () => Array.from(new Set(serverNames)).sort().join(','),
    [serverNames],
  );

  const [headerNamesByServer, setHeaderNamesByServer] = useState<
    Record<string, string[]>
  >({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const names = serverKey ? serverKey.split(',') : [];
    if (names.length === 0) {
      setHeaderNamesByServer({});
      setLoaded(true);
      return;
    }

    let cancelled = false;
    setLoaded(false);

    Promise.all(
      names.map(async (name): Promise<[string, string[]]> => {
        try {
          const detail = await mcpServersService.get(name);
          const headers = detail?.headers ?? [];
          return [name, headers.map(header => header.name)];
        } catch {
          return [name, []];
        }
      }),
    )
      .then(entries => {
        if (!cancelled) setHeaderNamesByServer(Object.fromEntries(entries));
      })
      .catch(() => {
        if (!cancelled) setHeaderNamesByServer({});
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [serverKey, enabled]);

  const allHeaderNames = useMemo(() => {
    const merged = new Set<string>();
    for (const names of Object.values(headerNamesByServer)) {
      for (const name of names) merged.add(name);
    }
    return Array.from(merged).sort((a, b) => a.localeCompare(b));
  }, [headerNamesByServer]);

  return { headerNamesByServer, allHeaderNames, loaded };
}
