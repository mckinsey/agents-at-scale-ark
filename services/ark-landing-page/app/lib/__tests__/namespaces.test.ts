/**
 * @jest-environment node
 */
import {
  clearNamespaceCache,
  fetchAccessibleNamespaces,
  mapWithConcurrency,
} from '../namespaces';

// SA token + CA read from the in-cluster mount.
jest.mock('fs', () => ({
  readFileSync: jest.fn(() => 'sa-token'),
}));

// Capture the SSAR body and allow only a fixed set of namespaces. This also
// asserts the impersonation headers are correct (one Impersonate-Group per
// group, not comma-joined) and that a per-request timeout is set.
const seenImpersonateGroups: Array<string | string[] | undefined> = [];
const seenTimeouts: Array<number | undefined> = [];
jest.mock('https', () => ({
  Agent: jest.fn(),
  request: (
    _url: string,
    opts: { headers: Record<string, unknown>; timeout?: number },
    cb: (res: unknown) => void,
  ) => {
    const chunks: string[] = [];
    seenImpersonateGroups.push(
      opts.headers['Impersonate-Group'] as string | string[] | undefined,
    );
    seenTimeouts.push(opts.timeout);
    return {
      on: jest.fn(),
      write: (b: string) => chunks.push(b),
      end: () => {
        const ns = JSON.parse(chunks.join('')).spec.resourceAttributes
          .namespace;
        const allowed = ns === 'tenant-a' || ns === 'tenant-b';
        const res = {
          on: (ev: string, fn: (d?: string) => void) => {
            if (ev === 'data') fn(JSON.stringify({ status: { allowed } }));
            if (ev === 'end') fn();
          },
        };
        cb(res);
      },
    };
  },
}));

const listNamespace = jest.fn();
jest.mock('@kubernetes/client-node', () => ({
  KubeConfig: jest.fn().mockImplementation(() => ({
    loadFromDefault: jest.fn(),
    getCurrentCluster: () => ({ server: 'https://k8s.local' }),
    makeApiClient: () => ({ listNamespace }),
  })),
  CoreV1Api: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  clearNamespaceCache();
  seenImpersonateGroups.length = 0;
  seenTimeouts.length = 0;
  listNamespace.mockResolvedValue({
    items: [
      {
        metadata: {
          name: 'tenant-a',
          annotations: {
            'ark.mckinsey.com/display-name': 'Tenant A',
            'ark.mckinsey.com/namespace-description': 'Workspace A',
            'ark.mckinsey.com/dashboard-url': 'https://custom/tenant-a',
          },
        },
      },
      { metadata: { name: 'tenant-b', annotations: {} } },
      { metadata: { name: 'kube-system' } },
    ],
  });
});

describe('fetchAccessibleNamespaces', () => {
  it('returns only namespaces the impersonated user may access', async () => {
    const result = await fetchAccessibleNamespaces({
      email: 'jane@acme.com',
      groups: ['All Firm Users', 'Admins for ARK'],
    });

    expect(result.map((n) => n.name)).toEqual(['tenant-a', 'tenant-b']);
    expect(result.map((n) => n.name)).not.toContain('kube-system');
  });

  it('maps display name / description / dashboard URL from annotations with fallbacks', async () => {
    const result = await fetchAccessibleNamespaces({
      email: 'jane@acme.com',
      groups: ['g'],
    });
    const a = result.find((n) => n.name === 'tenant-a')!;
    const b = result.find((n) => n.name === 'tenant-b')!;

    expect(a.displayName).toBe('Tenant A');
    expect(a.description).toBe('Workspace A');
    expect(a.dashboardUrl).toBe('https://custom/tenant-a');

    // tenant-b has no annotations -> fall back to the name, undefined extras
    expect(b.displayName).toBe('tenant-b');
    expect(b.description).toBeUndefined();
    expect(b.dashboardUrl).toBeUndefined();
  });

  it('sends one Impersonate-Group header per group (array, not comma-joined)', async () => {
    await fetchAccessibleNamespaces({
      email: 'jane@acme.com',
      groups: ['All Firm Users', 'Admins for ARK'],
    });

    expect(seenImpersonateGroups.length).toBeGreaterThan(0);
    for (const groups of seenImpersonateGroups) {
      expect(groups).toEqual(['All Firm Users', 'Admins for ARK']);
    }
  });

  it('returns [] when the identity has no email', async () => {
    expect(await fetchAccessibleNamespaces({})).toEqual([]);
    expect(await fetchAccessibleNamespaces({ groups: ['g'] })).toEqual([]);
    expect(listNamespace).not.toHaveBeenCalled();
  });

  it('sets a per-request timeout on every SSAR (no unbounded hang)', async () => {
    await fetchAccessibleNamespaces({ email: 'jane@acme.com', groups: ['g'] });

    expect(seenTimeouts.length).toBeGreaterThan(0);
    for (const t of seenTimeouts) {
      expect(typeof t).toBe('number');
      expect(t as number).toBeGreaterThan(0);
    }
  });

  it('caches results per identity within the TTL (no re-fan-out on repeat)', async () => {
    const identity = { email: 'jane@acme.com', groups: ['g'] };

    const first = await fetchAccessibleNamespaces(identity);
    const second = await fetchAccessibleNamespaces(identity);

    expect(second).toEqual(first);
    // Second call served from cache: the namespace listing ran only once.
    expect(listNamespace).toHaveBeenCalledTimes(1);
  });

  it('does not share cache across distinct identities', async () => {
    await fetchAccessibleNamespaces({ email: 'jane@acme.com', groups: ['g'] });
    await fetchAccessibleNamespaces({ email: 'bob@acme.com', groups: ['g'] });

    expect(listNamespace).toHaveBeenCalledTimes(2);
  });
});

describe('mapWithConcurrency', () => {
  it('preserves order and never exceeds the concurrency limit', async () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    let inFlight = 0;
    let maxInFlight = 0;

    const out = await mapWithConcurrency(items, 4, async (n) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
      return n * 2;
    });

    expect(out).toEqual(items.map((n) => n * 2));
    expect(maxInFlight).toBeLessThanOrEqual(4);
    expect(maxInFlight).toBeGreaterThan(1); // actually ran in parallel
  });

  it('handles an empty list', async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
  });
});
