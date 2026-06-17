import { describe, expect, it } from 'vitest';

import {
  canVerb,
  hasEssentialAccess,
  missingEssential,
} from '@/lib/permissions';
import type { Permissions } from '@/lib/services/namespaces';

const ok = (rules: Record<string, string[]>): Permissions => ({
  status: 'ok',
  reason: null,
  rules,
});

const essential = {
  agents: ['list'],
  models: ['list'],
  queries: ['list'],
  teams: ['list'],
  tools: ['list'],
};

describe('canVerb', () => {
  it('returns false when permissions are unavailable', () => {
    expect(
      canVerb(
        { status: 'unavailable', reason: null, rules: {} },
        'agents',
        'list',
      ),
    ).toBe(false);
  });

  it('returns false when permissions are missing', () => {
    expect(canVerb(null, 'agents', 'list')).toBe(false);
  });

  it('matches an explicit verb', () => {
    expect(canVerb(ok({ agents: ['get', 'list'] }), 'agents', 'list')).toBe(
      true,
    );
  });

  it('matches a wildcard verb', () => {
    expect(canVerb(ok({ agents: ['*'] }), 'agents', 'create')).toBe(true);
  });

  it('matches a wildcard resource', () => {
    expect(canVerb(ok({ '*': ['list'] }), 'models', 'list')).toBe(true);
  });
});

describe('missingEssential / hasEssentialAccess', () => {
  it('reports all essential resources missing for empty rules', () => {
    expect(missingEssential(ok({}))).toEqual([
      'agents',
      'models',
      'queries',
      'teams',
      'tools',
    ]);
    expect(hasEssentialAccess(ok({}))).toBe(false);
  });

  it('passes when every essential resource is listable', () => {
    expect(missingEssential(ok(essential))).toEqual([]);
    expect(hasEssentialAccess(ok(essential))).toBe(true);
  });

  it('passes for a cluster-admin wildcard', () => {
    expect(hasEssentialAccess(ok({ '*': ['*'] }))).toBe(true);
  });

  it('reports the specific missing resource', () => {
    const partial = { ...essential };
    delete (partial as Record<string, string[]>).tools;
    expect(missingEssential(ok(partial))).toEqual(['tools']);
    expect(hasEssentialAccess(ok(partial))).toBe(false);
  });

  it('is unavailable-safe (treats unavailable as no essential access)', () => {
    expect(
      hasEssentialAccess({ status: 'unavailable', reason: 'x', rules: {} }),
    ).toBe(false);
  });
});
