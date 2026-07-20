/**
 * @jest-environment node
 */
import { authConfig } from '../auth-config';

// The redirect callback lets the hub bounce a signed-in user back to a tenant
// dashboard on a different origin, but only for explicitly allow-listed origins.
describe('authConfig redirect callback', () => {
  const redirect = authConfig.callbacks!.redirect!;
  const baseUrl = 'https://hub.example.com';

  const call = (url: string) =>
    // NextAuth passes more fields; the callback only uses url + baseUrl.
    redirect({ url, baseUrl } as unknown as Parameters<typeof redirect>[0]);

  beforeEach(() => {
    delete process.env.AUTH_ALLOWED_CALLBACK_ORIGINS;
  });

  it('allows same-origin URLs', async () => {
    expect(await call(`${baseUrl}/foo`)).toBe(`${baseUrl}/foo`);
  });

  it('allows a configured external origin', async () => {
    process.env.AUTH_ALLOWED_CALLBACK_ORIGINS =
      'http://localhost:3000, https://other.example.com';
    expect(await call('http://localhost:3000/tenant-a')).toBe(
      'http://localhost:3000/tenant-a',
    );
    expect(await call('https://other.example.com/x')).toBe(
      'https://other.example.com/x',
    );
  });

  it('falls back to baseUrl for an unlisted external origin', async () => {
    process.env.AUTH_ALLOWED_CALLBACK_ORIGINS = 'http://localhost:3000';
    expect(await call('https://evil.example.com/x')).toBe(baseUrl);
  });

  it('falls back to baseUrl when no external origins are allowed', async () => {
    expect(await call('http://localhost:3000/tenant-a')).toBe(baseUrl);
  });
});

// The session callback exposes the user's groups (a non-secret identity claim)
// so the landing page can list accessible namespaces via impersonation — but it
// must NEVER surface the raw OIDC access token to client-side JS.
describe('authConfig session callback', () => {
  const session = authConfig.callbacks!.session!;

  it('exposes groups + user id on the session, but not the access token', async () => {
    const out = (await session({
      session: { user: {} },
      token: {
        id: 'user-1',
        access_token: 'access-abc',
        groups: ['All Firm Users', 'Admins for ARK'],
      },
    } as unknown as Parameters<typeof session>[0])) as unknown as {
      accessToken?: string;
      user?: { id?: string; groups?: string[] };
    };

    expect(out.user?.id).toBe('user-1');
    expect(out.user?.groups).toEqual(['All Firm Users', 'Admins for ARK']);
    // The raw access token must not leak onto the session.
    expect(out.accessToken).toBeUndefined();
  });

  it('defaults groups to [] when the token carries none', async () => {
    const out = (await session({
      session: { user: {} },
      token: { id: 'user-1' },
    } as unknown as Parameters<typeof session>[0])) as unknown as {
      accessToken?: string;
      user?: { groups?: string[] };
    };

    expect(out.user?.groups).toEqual([]);
    expect(out.accessToken).toBeUndefined();
  });
});

// The jwt callback decodes the groups claim from the access token at sign-in so
// the session can carry groups without ever exposing the token itself.
describe('authConfig jwt callback', () => {
  const jwt = authConfig.callbacks!.jwt!;

  const makeToken = (payload: Record<string, unknown>) => {
    const b64 = (o: unknown) =>
      Buffer.from(JSON.stringify(o)).toString('base64url');
    return `${b64({ alg: 'none' })}.${b64(payload)}.sig`;
  };

  it('extracts the groups claim from the access token on sign-in', async () => {
    const out = (await jwt({
      token: {},
      trigger: 'signIn',
      account: {
        access_token: makeToken({ groups: ['g1', 'g2'] }),
        expires_at: 0,
      },
    } as unknown as Parameters<typeof jwt>[0])) as unknown as {
      groups?: string[];
    };

    expect(out.groups).toEqual(['g1', 'g2']);
  });

  it('defaults to [] when the access token has no groups claim', async () => {
    const out = (await jwt({
      token: {},
      trigger: 'signIn',
      account: { access_token: makeToken({ sub: 'x' }), expires_at: 0 },
    } as unknown as Parameters<typeof jwt>[0])) as unknown as {
      groups?: string[];
    };

    expect(out.groups).toEqual([]);
  });
});
