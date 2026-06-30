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

// The session callback exposes the OIDC access token so the landing page can
// read the user's identity/groups to list accessible namespaces.
describe('authConfig session callback', () => {
  const session = authConfig.callbacks!.session!;

  it('exposes the access token and user id on the session', async () => {
    const out = (await session({
      session: { user: {} },
      token: { id: 'user-1', access_token: 'access-abc' },
    } as unknown as Parameters<typeof session>[0])) as unknown as {
      accessToken?: string;
      user?: { id?: string };
    };

    expect(out.accessToken).toBe('access-abc');
    expect(out.user?.id).toBe('user-1');
  });

  it('omits the access token when the token has none', async () => {
    const out = (await session({
      session: { user: {} },
      token: { id: 'user-1' },
    } as unknown as Parameters<typeof session>[0])) as unknown as {
      accessToken?: string;
    };

    expect(out.accessToken).toBeUndefined();
  });
});
