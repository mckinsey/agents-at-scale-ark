import type { NextAuthConfig } from 'next-auth';

import {
  COOKIE_CALLBACK_URL,
  COOKIE_CSRF_TOKEN,
  COOKIE_NONCE,
  COOKIE_PKCE_CODE_VERIFIER,
  COOKIE_SESSION_TOKEN,
  COOKIE_STATE,
  DEFAULT_SESSION_MAX_AGE,
  SIGNIN_PATH,
} from '../constants/auth';

import { createOIDCProvider } from './create-oidc-provider';

type JwtCallback = NonNullable<NonNullable<NextAuthConfig['callbacks']>['jwt']>;

// Decode (without verifying) the `groups` claim from a JWT. Only reads a token
// we just received from the IdP in this callback — it's our own data, and the
// group list is not a secret. Used so the session can carry groups without
// exposing the raw access token to the browser.
function extractGroups(accessToken?: string): string[] {
  if (!accessToken) return [];
  const payload = accessToken.split('.')[1];
  if (!payload) return [];
  try {
    const claims = JSON.parse(
      Buffer.from(
        payload.replace(/-/g, '+').replace(/_/g, '/'),
        'base64',
      ).toString('utf8'),
    );
    const raw = claims.groups;
    return Array.isArray(raw)
      ? raw.map(String)
      : typeof raw === 'string'
        ? [raw]
        : [];
  } catch {
    return [];
  }
}

async function jwtCallback({
  token,
  profile,
  account,
  trigger,
}: Parameters<JwtCallback>['0']): Promise<Awaited<ReturnType<JwtCallback>>> {
  if (trigger === 'signIn') {
    if (profile) {
      token.image = profile.avatar_url || profile.picture;
    }
    if (account) {
      token.access_token = account.access_token;
      token.refresh_token = account.refresh_token;
      token.expires_at = account.expires_at!;
      // Capture the user's groups now so the session can expose them without
      // ever surfacing the raw access token to client-side JS.
      (token as { groups?: string[] }).groups = extractGroups(
        account.access_token,
      );
    }
    if (account?.id_token) {
      token.id_token = account.id_token;
    }
  }

  return token;
}

type SessionCallback = NonNullable<
  NonNullable<NextAuthConfig['callbacks']>['session']
>;

function sessionCallback({
  session,
  token,
}: Parameters<SessionCallback>['0']): ReturnType<SessionCallback> {
  if (session?.user) {
    if (token?.id) {
      session.user.id = String(token.id);
    }
    // Expose the user's groups (not the raw access token) so the landing page can
    // list accessible namespaces via impersonation. email is already on the
    // session by default; groups + email are non-secret identity claims, whereas
    // the raw OIDC token must not be readable from client-side JS.
    (session.user as { groups?: string[] }).groups =
      (token as { groups?: string[] }).groups ?? [];
  }
  return session;
}

type AuthorizedCallback = NonNullable<
  NonNullable<NextAuthConfig['callbacks']>['authorized']
>;

function authorizedCallback({
  auth: session,
}: Parameters<AuthorizedCallback>['0']): ReturnType<AuthorizedCallback> {
  return !!session?.user;
}

const OIDCProvider = createOIDCProvider({
  clientId: process.env.OIDC_CLIENT_ID,
  issuer: process.env.OIDC_ISSUER_URL,
  name: process.env.OIDC_PROVIDER_NAME || 'unknown',
  id: process.env.OIDC_PROVIDER_ID || 'unknown',
  clientSecret: process.env.OIDC_CLIENT_SECRET,
});

function getSessionMaxAge() {
  const maxAgeFromEnv = Number.parseInt(process.env.SESSION_MAX_AGE || '', 10);
  return Number.isNaN(maxAgeFromEnv) ? DEFAULT_SESSION_MAX_AGE : maxAgeFromEnv;
}

const session: NextAuthConfig['session'] = {
  strategy: 'jwt',
  maxAge: getSessionMaxAge(),
};

const debug = process.env.AUTH_DEBUG === 'true';

const useSecureCookies = process.env.AUTH_URL?.startsWith('https://') || false;
const cookiePrefix = useSecureCookies ? '__Secure-' : '';
const cookies: NextAuthConfig['cookies'] = {
  sessionToken: {
    name: `${cookiePrefix}${COOKIE_SESSION_TOKEN}`,
  },
  callbackUrl: {
    name: `${cookiePrefix}${COOKIE_CALLBACK_URL}`,
  },
  csrfToken: {
    name: `${useSecureCookies ? '__Host-' : ''}${COOKIE_CSRF_TOKEN}`,
  },
  pkceCodeVerifier: {
    name: `${cookiePrefix}${COOKIE_PKCE_CODE_VERIFIER}`,
  },
  state: {
    name: `${cookiePrefix}${COOKIE_STATE}`,
  },
  nonce: {
    name: `${cookiePrefix}${COOKIE_NONCE}`,
  },
};

type RedirectCallback = NonNullable<
  NonNullable<NextAuthConfig['callbacks']>['redirect']
>;

// By default Auth.js only honours same-origin callback URLs and falls back to
// baseUrl for anything else. In the login-hub model the landing page signs a
// user in on behalf of a tenant dashboard served from a different origin
// (e.g. http://localhost:3000), so allow callback URLs whose origin is listed
// in AUTH_ALLOWED_CALLBACK_ORIGINS (comma-separated). Same-origin is always
// allowed; anything else falls back to baseUrl.
const redirectCallback: RedirectCallback = ({ url, baseUrl }) => {
  const allowed = (process.env.AUTH_ALLOWED_CALLBACK_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  try {
    const target = new URL(url, baseUrl);
    if (target.origin === new URL(baseUrl).origin || allowed.includes(target.origin)) {
      return target.toString();
    }
  } catch {
    // malformed url — fall through to baseUrl
  }
  return baseUrl;
};

const callbacks: NextAuthConfig['callbacks'] = {
  jwt: jwtCallback,
  session: sessionCallback,
  authorized: authorizedCallback,
  redirect: redirectCallback,
};

const pages: NextAuthConfig['pages'] = {
  signIn: SIGNIN_PATH,
};

export const authConfig: NextAuthConfig = {
  debug,
  trustHost: true,
  adapter: undefined,
  providers: [OIDCProvider],
  session,
  cookies,
  callbacks,
  useSecureCookies,
  pages,
};
