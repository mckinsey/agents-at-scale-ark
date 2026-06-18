import type { Permissions } from '@/lib/services/namespaces';

// Permissions come from /v1/context, which runs a SelfSubjectRulesReview as the
// impersonated user. `rules` maps an Ark resource (plural) to the verbs the user
// holds on it, e.g. { agents: ["get", "list"], "*": ["*"] }. A "*" resource key
// grants those verbs on every resource, and a "*" verb grants every verb; both
// are honoured by canVerb below.

// Resources a user must be able to list for the dashboard to be usable; lacking
// all of them is treated as "no access" to the namespace.
export const ESSENTIAL_RESOURCES = [
  'agents',
  'models',
  'queries',
  'teams',
  'tools',
];

const WILDCARD = '*';

// True if `permissions` grants `verb` on `resource`, honouring "*" wildcards on
// either the resource key or the verb list. False unless status is "ok".
export function canVerb(
  permissions: Permissions | null | undefined,
  resource: string,
  verb: string,
): boolean {
  if (!permissions || permissions.status !== 'ok') {
    return false;
  }
  const rules = permissions.rules ?? {};
  // RBAC rules are additive: a resource-specific rule and a "*" resource rule
  // both apply, so union their verbs rather than letting one shadow the other.
  const verbs = [...(rules[resource] ?? []), ...(rules[WILDCARD] ?? [])];
  return verbs.includes(verb) || verbs.includes(WILDCARD);
}

// The essential resources the user cannot list, in declaration order.
export function missingEssential(
  permissions: Permissions | null | undefined,
): string[] {
  return ESSENTIAL_RESOURCES.filter(
    resource => !canVerb(permissions, resource, 'list'),
  );
}

// True only if the user can list every essential resource (none missing).
export function hasEssentialAccess(
  permissions: Permissions | null | undefined,
): boolean {
  return missingEssential(permissions).length === 0;
}
