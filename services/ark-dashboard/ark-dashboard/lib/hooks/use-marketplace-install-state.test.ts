import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { installRecordKey } from '@/atoms/marketplace-install';
import type { MarketplaceItem } from '@/lib/api/generated/marketplace-types';
import type { InstallRecord } from '@/lib/services/marketplace-install-types';

import {
  resolveInstallState,
  useMarketplaceInstallState,
} from './use-marketplace-install-state';

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({
    namespace: 'test-namespace',
    isNamespaceResolved: true,
    isPending: false,
    readOnlyMode: false,
  }),
}));

function makeItem(overrides?: Partial<MarketplaceItem>): MarketplaceItem {
  return {
    id: 'test-item',
    name: 'Test Item',
    description: 'A test item',
    shortDescription: 'A test',
    category: 'tools',
    type: 'component',
    version: '1.0.0',
    author: 'Test',
    status: 'available',
    installable: true,
    featured: false,
    downloads: 0,
    tags: [],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    ...overrides,
  };
}

describe('resolveInstallState', () => {
  it('returns installable for a fresh item with no record', () => {
    expect(resolveInstallState(makeItem(), undefined)).toBe('installable');
  });

  it('returns platform-managed when the catalog says the item is not installable', () => {
    expect(
      resolveInstallState(makeItem({ installable: false }), undefined),
    ).toBe('platform-managed');
  });

  it('returns platform-managed for a fixture id', () => {
    expect(resolveInstallState(makeItem({ id: 'phoenix' }), undefined)).toBe(
      'platform-managed',
    );
  });

  it('prefers platform-managed over an install record', () => {
    const record: InstallRecord = { state: 'installed' };
    expect(resolveInstallState(makeItem({ installable: false }), record)).toBe(
      'platform-managed',
    );
  });

  it('returns failed when the record failed', () => {
    const record: InstallRecord = { state: 'failed', failedStage: 'apply' };
    expect(resolveInstallState(makeItem(), record)).toBe('failed');
  });

  it('prefers failed over a helm-derived installed status', () => {
    const record: InstallRecord = { state: 'failed', failedStage: 'apply' };
    expect(resolveInstallState(makeItem({ status: 'installed' }), record)).toBe(
      'failed',
    );
  });

  it('returns installed from the record', () => {
    const record: InstallRecord = { state: 'installed' };
    expect(resolveInstallState(makeItem(), record)).toBe('installed');
  });

  it('returns installed from the helm-derived status', () => {
    expect(
      resolveInstallState(makeItem({ status: 'installed' }), undefined),
    ).toBe('installed');
  });

  it('returns installed for a pre-installed fixture id', () => {
    expect(resolveInstallState(makeItem({ id: 'noah' }), undefined)).toBe(
      'installed',
    );
  });
});

describe('installRecordKey', () => {
  it('namespaces the key so two namespaces never share a record', () => {
    expect(installRecordKey('alpha', 'phoenix')).toBe('alpha/phoenix');
    expect(installRecordKey('beta', 'phoenix')).toBe('beta/phoenix');
    expect(installRecordKey('alpha', 'phoenix')).not.toBe(
      installRecordKey('beta', 'phoenix'),
    );
  });
});

describe('useMarketplaceInstallState', () => {
  it('starts installable and records state under the namespaced key', () => {
    const item = makeItem();
    const { result } = renderHook(() => useMarketplaceInstallState(item));

    expect(result.current.state).toBe('installable');
    expect(result.current.record).toBeUndefined();
    expect(typeof result.current.setRecord).toBe('function');
  });
});
