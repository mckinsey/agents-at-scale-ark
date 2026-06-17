import type { Permissions } from '@/lib/services/namespaces';

export const ESSENTIAL_RESOURCES = [
  'agents',
  'models',
  'queries',
  'teams',
  'tools',
];

const WILDCARD = '*';

export function canVerb(
  permissions: Permissions | null | undefined,
  resource: string,
  verb: string,
): boolean {
  if (!permissions || permissions.status !== 'ok') {
    return false;
  }
  const rules = permissions.rules ?? {};
  const verbs = rules[resource] ?? rules[WILDCARD] ?? [];
  return verbs.includes(verb) || verbs.includes(WILDCARD);
}

export function missingEssential(
  permissions: Permissions | null | undefined,
): string[] {
  return ESSENTIAL_RESOURCES.filter(
    resource => !canVerb(permissions, resource, 'list'),
  );
}

export function hasEssentialAccess(
  permissions: Permissions | null | undefined,
): boolean {
  return missingEssential(permissions).length === 0;
}
