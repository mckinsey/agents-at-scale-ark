'use client';

import { useAtom, useAtomValue } from 'jotai';
import { useCallback, useEffect, useState } from 'react';

import {
  installRecordItemId,
  installRecordKey,
  marketplaceInstallRecordsAtom,
} from '@/atoms/marketplace-install';
import type {
  MarketplaceInstallState,
  MarketplaceItem,
} from '@/lib/api/generated/marketplace-types';
import {
  isPlatformManagedFixture,
  isPreInstalledFixture,
} from '@/lib/services/marketplace-install-fixtures';
import {
  deriveOutcome,
  deriveStages,
  elapsedSince,
} from '@/lib/services/marketplace-install-mock';
import type {
  InstallRecord,
  InstallStage,
} from '@/lib/services/marketplace-install-types';
import { useNamespace } from '@/providers/NamespaceProvider';

const TICK_INTERVAL_MS = 1000;

export function resolveInstallState(
  item: MarketplaceItem,
  record: InstallRecord | undefined,
): MarketplaceInstallState {
  if (!item.installable || isPlatformManagedFixture(item.id)) {
    return 'platform-managed';
  }

  if (record) {
    return record.state;
  }

  if (item.status === 'installed' || isPreInstalledFixture(item.id)) {
    return 'installed';
  }

  return 'installable';
}

export function useInstallStateResolver(): (
  item: MarketplaceItem,
) => MarketplaceInstallState {
  const { namespace } = useNamespace();
  const records = useAtomValue(marketplaceInstallRecordsAtom);

  return useCallback(
    (item: MarketplaceItem) =>
      resolveInstallState(item, records[installRecordKey(namespace, item.id)]),
    [namespace, records],
  );
}

/** Re-renders on an interval only while something needs a ticking clock. */
export function useInstallClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) {
      return;
    }
    const id = setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [active]);

  return now;
}

/**
 * Advances in-flight installs to their terminal state. This must be called from
 * somewhere always mounted — a card only exists on the marketplace page, so an
 * install finishing while the user is elsewhere would otherwise never settle.
 */
export function useSettleInstalls(): void {
  const { namespace } = useNamespace();
  const [records, setRecords] = useAtom(marketplaceInstallRecordsAtom);
  const prefix = `${namespace}/`;
  const hasInFlight = Object.entries(records).some(
    ([key, record]) => record.state === 'installing' && key.startsWith(prefix),
  );
  const now = useInstallClock(hasInFlight);

  useEffect(() => {
    if (!hasInFlight) {
      return;
    }

    const settled: Record<string, InstallRecord> = {};
    for (const [key, record] of Object.entries(records)) {
      if (record.state !== 'installing' || !key.startsWith(prefix)) {
        continue;
      }
      const outcome = deriveOutcome(
        installRecordItemId(key),
        elapsedSince(record.startedAt, now),
      );
      if (outcome) {
        settled[key] = { ...record, ...outcome };
      }
    }

    if (Object.keys(settled).length > 0) {
      setRecords(current => ({ ...current, ...settled }));
    }
  }, [hasInFlight, records, now, prefix, setRecords]);
}

interface NamespaceInstallLock {
  readonly itemId: string;
  readonly itemName: string;
  readonly record: InstallRecord;
}

/**
 * The in-flight install for this namespace, if any. Install is one-at-a-time
 * namespace-wide, so every tile consults this rather than carrying a state of
 * its own for "someone else is installing".
 */
export function useNamespaceInstallLock(): NamespaceInstallLock | null {
  const { namespace } = useNamespace();
  const records = useAtomValue(marketplaceInstallRecordsAtom);

  const entry = Object.entries(records).find(
    ([key, record]) =>
      record.state === 'installing' && key.startsWith(`${namespace}/`),
  );

  if (!entry) {
    return null;
  }

  const [key, record] = entry;
  return {
    itemId: installRecordItemId(key),
    itemName: record.itemName,
    record,
  };
}

export interface InstallNoticeEntry {
  readonly itemId: string;
  readonly record: InstallRecord;
  readonly acknowledge: () => void;
}

/**
 * What the sidebar should surface: an in-flight install, or a finished one the
 * user has not opened yet. A result stays put until acknowledged so it cannot
 * be missed while the user is on another page.
 */
export function useInstallNotice(): InstallNoticeEntry | null {
  const { namespace } = useNamespace();
  const [records, setRecords] = useAtom(marketplaceInstallRecordsAtom);
  const prefix = `${namespace}/`;

  const entry = Object.entries(records).find(
    ([key, record]) =>
      key.startsWith(prefix) &&
      (record.state === 'installing' || !record.acknowledged),
  );

  const key = entry?.[0];
  const acknowledge = useCallback(() => {
    if (!key) {
      return;
    }
    setRecords(current => {
      const existing = current[key];
      if (!existing) {
        return current;
      }
      return { ...current, [key]: { ...existing, acknowledged: true } };
    });
  }, [key, setRecords]);

  if (!entry || !key) {
    return null;
  }

  return { itemId: installRecordItemId(key), record: entry[1], acknowledge };
}

interface UseMarketplaceInstallStateResult {
  readonly state: MarketplaceInstallState;
  readonly record: InstallRecord | undefined;
  readonly stages: InstallStage[] | null;
  readonly setRecord: (record: InstallRecord) => void;
  readonly startRecord: (record: InstallRecord) => void;
}

export function useMarketplaceInstallState(
  item: MarketplaceItem,
): UseMarketplaceInstallStateResult {
  const { namespace } = useNamespace();
  const [records, setRecords] = useAtom(marketplaceInstallRecordsAtom);
  const key = installRecordKey(namespace, item.id);
  const record = records[key];
  const installing = record?.state === 'installing';
  const now = useInstallClock(installing);

  const setRecord = useCallback(
    (next: InstallRecord) => {
      setRecords(current => ({ ...current, [key]: next }));
    },
    [key, setRecords],
  );

  const stages = installing
    ? deriveStages(item.id, elapsedSince(record.startedAt, now))
    : null;

  return {
    state: resolveInstallState(item, record),
    record,
    stages,
    setRecord,
    startRecord: setRecord,
  };
}
