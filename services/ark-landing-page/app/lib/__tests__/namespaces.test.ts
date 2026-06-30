/**
 * @jest-environment node
 */
import { fetchAccessibleNamespaces } from '../namespaces';

// SA token + CA read from the in-cluster mount.
jest.mock('fs', () => ({
  readFileSync: jest.fn(() => 'sa-token'),
}));

// Capture the SSAR body and allow only a fixed set of namespaces. This also
// asserts the impersonation headers are correct (one Impersonate-Group per
// group, not comma-joined).
const seenImpersonateGroups: Array<string | string[] | undefined> = [];
jest.mock('https', () => ({
  Agent: jest.fn(),
  request: (_url: string, opts: { headers: Record<string, unknown> }, cb: (res: unknown) => void) => {
    const chunks: string[] = [];
    seenImpersonateGroups.push(
      opts.headers['Impersonate-Group'] as string | string[] | undefined,
    );
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

function makeToken(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'none' })}.${b64(payload)}.sig`;
}

beforeEach(() => {
  jest.clearAllMocks();
  seenImpersonateGroups.length = 0;
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
    const token = makeToken({
      email: 'jane@acme.com',
      groups: ['All Firm Users', 'Admins for ARK'],
    });

    const result = await fetchAccessibleNamespaces(token);

    expect(result.map((n) => n.name)).toEqual(['tenant-a', 'tenant-b']);
    expect(result.map((n) => n.name)).not.toContain('kube-system');
  });

  it('maps display name / description / dashboard URL from annotations with fallbacks', async () => {
    const token = makeToken({ email: 'jane@acme.com', groups: ['g'] });

    const result = await fetchAccessibleNamespaces(token);
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
    const token = makeToken({
      email: 'jane@acme.com',
      groups: ['All Firm Users', 'Admins for ARK'],
    });

    await fetchAccessibleNamespaces(token);

    expect(seenImpersonateGroups.length).toBeGreaterThan(0);
    for (const groups of seenImpersonateGroups) {
      expect(groups).toEqual(['All Firm Users', 'Admins for ARK']);
    }
  });

  it('returns [] when the token has no identity', async () => {
    expect(await fetchAccessibleNamespaces(undefined)).toEqual([]);
    expect(await fetchAccessibleNamespaces(makeToken({ sub: 'x' }))).toEqual([]);
    expect(listNamespace).not.toHaveBeenCalled();
  });
});
