import type { MarketplaceItem } from '@/lib/api/generated/marketplace-types';
import { readPositiveInt } from '@/lib/utils/read-positive-int';

import {
  getCollisionFixtures,
  getFailureStageFixture,
} from './marketplace-install-fixtures';
import type {
  InstallRecord,
  InstallResource,
  InstallResourceState,
  InstallStage,
  InstallStageDefinition,
  InstallStageId,
  MarketplaceInstallPreview,
} from './marketplace-install-types';

export const INSTALL_STAGES: readonly InstallStageDefinition[] = [
  { id: 'resolve', label: 'Resolving chart', durationMs: 2200 },
  { id: 'render', label: 'Rendering templates', durationMs: 2800 },
  {
    id: 'crds',
    label: 'Applying custom resource definitions',
    durationMs: 3600,
  },
  { id: 'apply', label: 'Creating resources', durationMs: 4200 },
  {
    id: 'ready',
    label: 'Waiting for resources to become ready',
    durationMs: 5200,
  },
];

const PREVIEW_DELAY_MS = 400;

export function getInstallStageLabel(id: InstallStageId): string {
  return INSTALL_STAGES.find(stage => stage.id === id)?.label ?? id;
}

export function createPendingStages(): InstallStage[] {
  return INSTALL_STAGES.map(stage => ({
    id: stage.id,
    label: stage.label,
    state: 'pending',
  }));
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

function releaseNameFor(item: MarketplaceItem): string {
  return item.id;
}

function isMcpItem(item: MarketplaceItem): boolean {
  return item.category === 'mcp-servers';
}

function applyCollisions(
  item: MarketplaceItem,
  resources: InstallResource[],
): InstallResource[] {
  const fixtures = getCollisionFixtures(item.id);
  if (fixtures.length === 0) {
    return resources;
  }

  return resources.map(resource => {
    const hit = fixtures.find(
      fixture =>
        fixture.kind === resource.kind && fixture.name === resource.name,
    );
    if (!hit) {
      return resource;
    }

    let state: InstallResourceState;
    if (hit.unverifiable) {
      state = 'unverifiable';
    } else if (hit.ownedByRelease) {
      state = 'conflict-release';
    } else {
      state = 'conflict-unmanaged';
    }

    return { ...resource, state, ownedByRelease: hit.ownedByRelease };
  });
}

function buildBaseResources(
  item: MarketplaceItem,
  namespace: string,
): InstallResource[] {
  const release = releaseNameFor(item);
  const base: InstallResource[] = [
    { kind: 'ServiceAccount', name: release, namespace, state: 'free' },
    {
      kind: 'ConfigMap',
      name: `${release}-values`,
      namespace,
      state: 'free',
    },
    {
      kind: 'Secret',
      name: `${release}-credentials`,
      namespace,
      state: 'free',
    },
  ];

  if (isMcpItem(item)) {
    return [
      { kind: 'MCPServer', name: release, namespace, state: 'free' },
      { kind: 'Deployment', name: release, namespace, state: 'free' },
      { kind: 'Service', name: release, namespace, state: 'free' },
      ...base,
    ];
  }

  if (item.type === 'executor') {
    return [
      {
        kind: 'CustomResourceDefinition',
        name: 'executionengines.ark.mckinsey.com',
        state: 'free',
      },
      { kind: 'ExecutionEngine', name: release, namespace, state: 'free' },
      { kind: 'Deployment', name: release, namespace, state: 'free' },
      { kind: 'Service', name: release, namespace, state: 'free' },
      ...base,
    ];
  }

  if (item.type === 'demo') {
    return [
      { kind: 'Team', name: `${release}-team`, namespace, state: 'free' },
      {
        kind: 'Agent',
        name: `${release}-analyst`,
        namespace,
        state: 'free',
      },
      {
        kind: 'Agent',
        name: `${release}-reviewer`,
        namespace,
        state: 'free',
      },
      {
        kind: 'Query',
        name: `${release}-example`,
        namespace,
        state: 'free',
      },
      { kind: 'Model', name: 'default', namespace, state: 'free' },
      ...base,
    ];
  }

  if (item.category === 'agents') {
    return [
      { kind: 'Agent', name: release, namespace, state: 'free' },
      { kind: 'Model', name: 'default', namespace, state: 'free' },
      ...base,
    ];
  }

  return [
    { kind: 'Deployment', name: release, namespace, state: 'free' },
    { kind: 'Service', name: release, namespace, state: 'free' },
    ...base,
  ];
}

function buildResources(
  item: MarketplaceItem,
  namespace: string,
): InstallResource[] {
  return applyCollisions(item, buildBaseResources(item, namespace));
}

export async function getInstallPreview(
  namespace: string,
  item: MarketplaceItem,
): Promise<MarketplaceInstallPreview> {
  await delay(PREVIEW_DELAY_MS);

  return {
    chartName: item.id,
    chartVersion: item.version,
    releaseName: releaseNameFor(item),
    namespace,
    resources: buildResources(item, namespace),
  };
}

export const INSTALL_TOTAL_DURATION_MS = INSTALL_STAGES.reduce(
  (total, stage) => total + stage.durationMs,
  0,
);

export const INSTALL_TIMEOUT_MS = readPositiveInt(
  process.env.NEXT_PUBLIC_MARKETPLACE_INSTALL_TIMEOUT_MS,
  INSTALL_TOTAL_DURATION_MS + 12_000,
);

export function elapsedSince(startedAt: string, now: number): number {
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) {
    return 0;
  }
  return Math.max(0, now - started);
}

function failureElapsedMs(failAt: InstallStageId | undefined): number | null {
  if (!failAt) {
    return null;
  }
  let cumulative = 0;
  for (const stage of INSTALL_STAGES) {
    cumulative += stage.durationMs;
    if (stage.id === failAt) {
      return cumulative;
    }
  }
  return null;
}

export function deriveStages(
  itemId: string,
  elapsedMs: number,
): InstallStage[] {
  const failAt = getFailureStageFixture(itemId);
  const stages = createPendingStages();
  let cumulative = 0;

  for (const [index, definition] of INSTALL_STAGES.entries()) {
    const startsAt = cumulative;
    cumulative += definition.durationMs;

    if (elapsedMs >= cumulative) {
      stages[index] = {
        ...stages[index],
        state: definition.id === failAt ? 'failed' : 'done',
      };
      if (definition.id === failAt) {
        break;
      }
      continue;
    }

    if (elapsedMs >= startsAt) {
      stages[index] = { ...stages[index], state: 'running' };
    }
    break;
  }

  return stages;
}

export function deriveOutcome(
  itemId: string,
  elapsedMs: number,
): Pick<InstallRecord, 'state' | 'failedStage'> | null {
  if (elapsedMs >= INSTALL_TIMEOUT_MS) {
    return { state: 'timed-out' };
  }

  const failsAt = failureElapsedMs(getFailureStageFixture(itemId));
  if (failsAt !== null && elapsedMs >= failsAt) {
    return { state: 'failed', failedStage: getFailureStageFixture(itemId) };
  }

  if (failsAt === null && elapsedMs >= INSTALL_TOTAL_DURATION_MS) {
    return { state: 'installed' };
  }

  return null;
}

export function startInstall(
  item: MarketplaceItem,
  resources: InstallResource[],
): InstallRecord {
  return {
    state: 'installing',
    startedAt: new Date().toISOString(),
    itemName: item.name,
    resources,
  };
}

export function completedResources(
  namespace: string,
  item: MarketplaceItem,
): InstallResource[] {
  return buildResources(item, namespace);
}
