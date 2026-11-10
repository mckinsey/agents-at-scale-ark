import { atomWithStorage } from 'jotai/utils';

import type { InstallRecord } from '@/lib/services/marketplace-install-types';

export const MARKETPLACE_INSTALL_RECORDS_KEY = 'marketplace-install-records';

export function installRecordKey(namespace: string, itemId: string): string {
  return `${namespace}/${itemId}`;
}

export function installRecordNamespace(key: string): string {
  return key.slice(0, key.indexOf('/'));
}

export function installRecordItemId(key: string): string {
  return key.slice(key.indexOf('/') + 1);
}

export const marketplaceInstallRecordsAtom = atomWithStorage<
  Record<string, InstallRecord>
>(MARKETPLACE_INSTALL_RECORDS_KEY, {}, undefined, { getOnInit: true });
