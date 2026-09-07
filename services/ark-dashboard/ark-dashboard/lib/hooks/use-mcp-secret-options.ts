'use client';

import { useEffect, useMemo, useState } from 'react';

import { secretsService } from '@/lib/services';

export interface McpSecretOption {
  value: string;
  label: string;
  secretName: string;
  secretKey: string;
}

export interface UseMcpSecretOptionsResult {
  options: McpSecretOption[];
  secretNames: string[];
  loaded: boolean;
}

interface SecretEntry {
  name: string;
  keys: string[];
}

const USABLE_SECRET_TYPE = 'Opaque';

export function secretOptionValue(
  secretName: string,
  secretKey: string,
): string {
  return `${secretName}/${secretKey}`;
}

export function useMcpSecretOptions(
  enabled: boolean = true,
): UseMcpSecretOptionsResult {
  const [entries, setEntries] = useState<SecretEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled || loaded) return;

    let cancelled = false;

    secretsService
      .getAll()
      .then(secrets =>
        Promise.all(
          secrets.map(async secret => {
            try {
              const detail = await secretsService.get(secret.name);
              return {
                name: secret.name,
                keys: detail.type === USABLE_SECRET_TYPE ? (detail.keys ?? []) : [],
              };
            } catch {
              return { name: secret.name, keys: [] };
            }
          }),
        ),
      )
      .then(result => {
        if (!cancelled) setEntries(result.filter(entry => entry.keys.length > 0));
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, loaded]);

  const options = useMemo(
    () =>
      entries.flatMap(entry =>
        entry.keys.map(key => ({
          value: secretOptionValue(entry.name, key),
          label: `${entry.name} · ${key}`,
          secretName: entry.name,
          secretKey: key,
        })),
      ),
    [entries],
  );

  const secretNames = useMemo(
    () => entries.map(entry => entry.name),
    [entries],
  );

  return { options, secretNames, loaded };
}
