export type InstallResourceState =
  | 'free'
  | 'adopted'
  | 'conflict-release'
  | 'conflict-unmanaged'
  | 'unverifiable';

export interface InstallResource {
  kind: string;
  name: string;
  namespace?: string;
  state: InstallResourceState;
  ownedByRelease?: string;
}

export interface MarketplaceInstallPreview {
  chartName: string;
  chartVersion: string;
  releaseName: string;
  namespace: string;
  resources: InstallResource[];
}

export const BLOCKING_RESOURCE_STATES: readonly InstallResourceState[] = [
  'conflict-release',
  'conflict-unmanaged',
];

export function isBlockingResource(resource: InstallResource): boolean {
  return BLOCKING_RESOURCE_STATES.includes(resource.state);
}

export function countBlockingResources(resources: InstallResource[]): number {
  return resources.filter(isBlockingResource).length;
}

export function countUnverifiableResources(
  resources: InstallResource[],
): number {
  return resources.filter(resource => resource.state === 'unverifiable').length;
}

export type InstallStageId = 'resolve' | 'render' | 'crds' | 'apply' | 'ready';

export type InstallStageState = 'pending' | 'running' | 'done' | 'failed';

export interface InstallStage {
  id: InstallStageId;
  label: string;
  state: InstallStageState;
}

export interface InstallStageDefinition {
  id: InstallStageId;
  label: string;
  durationMs: number;
}

export type InstallRecordState =
  | 'installing'
  | 'installed'
  | 'failed'
  | 'timed-out';

export interface InstallRecord {
  state: InstallRecordState;
  startedAt: string;
  itemName: string;
  /** Set once the user has opened the result, which retires the sidebar entry. */
  acknowledged?: boolean;
  resources?: InstallResource[];
  failedStage?: InstallStageId;
}

export function isTerminalRecord(record: InstallRecord | undefined): boolean {
  return record !== undefined && record.state !== 'installing';
}
