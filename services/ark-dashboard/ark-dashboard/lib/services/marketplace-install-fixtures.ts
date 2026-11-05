import type { InstallStageId } from './marketplace-install-types';

export const PLATFORM_MANAGED_IDS: readonly string[] = ['phoenix', 'langfuse'];

export const FAIL_FIXTURES: Readonly<Record<string, InstallStageId>> = {
  'ark-sandbox': 'apply',
};

export const PRE_INSTALLED_IDS: readonly string[] = ['noah'];

export interface CollisionFixture {
  readonly kind: string;
  readonly name: string;
  readonly ownedByRelease?: string;
  readonly unverifiable?: boolean;
}

export const COLLISION_FIXTURES: Readonly<
  Record<string, readonly CollisionFixture[]>
> = {
  'kyc-onboarding-bundle': [
    { kind: 'Model', name: 'default', ownedByRelease: 'ark-tenant' },
    { kind: 'ConfigMap', name: 'kyc-onboarding-bundle-values' },
  ],
  'mcp-inspector': [
    { kind: 'Secret', name: 'mcp-inspector-credentials', unverifiable: true },
  ],
};

export function isPlatformManagedFixture(id: string): boolean {
  return PLATFORM_MANAGED_IDS.includes(id);
}

export function isPreInstalledFixture(id: string): boolean {
  return PRE_INSTALLED_IDS.includes(id);
}

export function getFailureStageFixture(id: string): InstallStageId | undefined {
  return Object.hasOwn(FAIL_FIXTURES, id) ? FAIL_FIXTURES[id] : undefined;
}

export function getCollisionFixtures(id: string): readonly CollisionFixture[] {
  return Object.hasOwn(COLLISION_FIXTURES, id) ? COLLISION_FIXTURES[id] : [];
}
