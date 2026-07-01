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
} from '@/lib/constants/auth';

import { createOIDCProvider } from './create-oidc-provider';
import { TokenManager } from './token-manager';

// Extract the jwt callback type from NextAuthConfig
type JwtCallback = NonNullable<NonNullable<NextAuthConfig['callbacks']>['jwt']>;

async function jwtCallback({
  token,
  profile,
  account,
  trigger,
  session,
}: Parameters<JwtCallback>['0']): Promise<Awaited<ReturnType<JwtCallback>>> {
  if (trigger === 'signIn') {
    if (profile) {
      token.image = profile.avatar_url || profile.picture;
    }
    if (account) {
      token.access_token = account.access_token;
      token.refresh_token = account.refresh_token;
      token.expires_at = account.expires_at!;
    }
    if (account?.id_token) {
      token.id_token = account.id_token;
    }
  }

  if (trigger === 'update' && session?.shouldRefreshToken) {
    return await TokenManager.getNewAccessToken(token);
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
  // NextAuth stores the subject on token.sub, not token.id
  // Fall back to token.id for compatibility if it exists
  const userId = token?.id ?? token?.sub;
  if (session?.user && userId) {
    session.user.id = String(userId);
  }
  return session;
}

type AuthorizedCallback = NonNullable<
  NonNullable<NextAuthConfig['callbacks']>['authorized']
>;

function authorizedCallback({
  auth: session,
}: Parameters<AuthorizedCallback>['0']): ReturnType<AuthorizedCallback> {
  return !!session?.user; //When the JWT signed by auth js expires the session becomes null
}

const OIDCProvider = createOIDCProvider({
  clientId: process.env.OIDC_CLIENT_ID,
  issuer: process.env.OIDC_ISSUER_URL,
  name: process.env.OIDC_PROVIDER_NAME || 'unknown',
  id: process.env.OIDC_PROVIDER_ID || 'unknown',
  clientSecret: process.env.OIDC_CLIENT_SECRET,
});

function getSessionMaxAge() {
  const maxAgeFromEnv = parseInt(process.env.SESSION_MAX_AGE || ''); //An empty string will result in NaN
  //If SESSION_MAX_AGE is not set or is not a valid value we default to DEFAULT_SESSION_MAX_AGE (30mins)
  return isNaN(maxAgeFromEnv) ? DEFAULT_SESSION_MAX_AGE : maxAgeFromEnv;
}

const session: NextAuthConfig['session'] = {
  strategy: 'jwt',
  maxAge: getSessionMaxAge(),
};

const debug = process.env.AUTH_DEBUG === 'true';

// Since we are using custom cookie names we have to manage these settings ourselfs.
// https://authjs.dev/reference/nextjs#cookies
export const useSecureCookies =
  process.env.AUTH_URL?.startsWith('https://') || false;
const cookiePrefix = useSecureCookies ? '__Secure-' : '';

// Resolved session cookie name. getToken() in middleware and federated
// signout MUST read by this exact name — Auth.js derives its decryption
// salt from cookieName, so a bare-name read against a __Secure- cookie
// returns null and every proxied call 401s. See issue #2318.
export const SESSION_COOKIE_NAME = `${cookiePrefix}${COOKIE_SESSION_TOKEN}`;

const cookies: NextAuthConfig['cookies'] = {
  sessionToken: {
    name: SESSION_COOKIE_NAME,
  },
  callbackUrl: {
    name: `${cookiePrefix}${COOKIE_CALLBACK_URL}`,
  },
  csrfToken: {
    // Default to __Host- for CSRF token for additional protection if using useSecureCookies
    // NB: The `__Host-` prefix is stricter than the `__Secure-` prefix.
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

// Transient OIDC-flow cookies (state, PKCE verifier, nonce, callback-url, CSRF
// token). Sign-out must clear these alongside the session: Auth.js writes a
// fresh `state`/PKCE cookie at sign-in and reads it back at the callback, but a
// stale value left over from a prior flow fails state validation
// (CallbackRouteError -> error=Configuration), breaking the next sign-in.
export const OIDC_FLOW_COOKIE_NAMES = [
  `${cookiePrefix}${COOKIE_CALLBACK_URL}`,
  `${useSecureCookies ? '__Host-' : ''}${COOKIE_CSRF_TOKEN}`,
  `${cookiePrefix}${COOKIE_PKCE_CODE_VERIFIER}`,
  `${cookiePrefix}${COOKIE_STATE}`,
  `${cookiePrefix}${COOKIE_NONCE}`,
];

const callbacks: NextAuthConfig['callbacks'] = {
  jwt: jwtCallback,
  session: sessionCallback,
  authorized: authorizedCallback,
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
