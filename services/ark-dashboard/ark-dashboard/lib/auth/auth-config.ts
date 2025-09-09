import { NextAuthConfig } from "next-auth";
import { createOIDCProvider } from "./create-oidc-provider";
import { TokenManager } from "./token-manager";
import {
  COOKIE_SESSION_TOKEN,
  SIGNIN_PATH
} from "@/lib/constants/auth";

// Extract the jwt callback type from NextAuthConfig
type JwtCallback = NonNullable<NonNullable<NextAuthConfig['callbacks']>['jwt']>;

async function jwtCallback({token, profile, account, trigger, session}: Parameters<JwtCallback>['0']): Promise<Awaited<ReturnType<JwtCallback>>> {
  if(trigger === 'signIn') {
    if (profile) {
      token.image = profile.avatar_url || profile.picture;
    }
    if (account) {
      token.access_token = account.access_token;
      token.refresh_token = account.refresh_token;
      token.expires_at = account.expires_at!;
    }
    if(account?.id_token){
      token.id_token = account.id_token;
    }
  }

  if(trigger === 'update' && session?.shouldRefreshToken) {
    return await TokenManager.getNewAccessToken(token);
  }

  return token;
}

type SessionCallback = NonNullable<NonNullable<NextAuthConfig['callbacks']>['session']>;

function sessionCallback({ session, token }: Parameters<SessionCallback>['0']): ReturnType<SessionCallback> {
  if (session?.user && token?.id) {
    session.user.id = String(token.id);
  }
  return session;
};

type AuthorizedCallback = NonNullable<NonNullable<NextAuthConfig['callbacks']>['authorized']>;

function authorizedCallback({ auth: session }: Parameters<AuthorizedCallback>['0']): ReturnType<AuthorizedCallback> {
  return !!session?.user; //When the JWT signed by auth js expires the session becomes null
};

const OIDCProvider = createOIDCProvider({
  clientId: process.env.OIDC_CLIENT_ID,
  issuer: process.env.OIDC_ISSUER_URL,
  name: process.env.OIDC_PROVIDER_NAME || 'unknown',
  id: process.env.OIDC_PROVIDER_ID || 'unknown',
  clientSecret: process.env.OIDC_CLIENT_SECRET
});

const debug = process.env.AUTH_DEBUG === "true";
const useSecureCookies = process.env.NEXTAUTH_URL?.startsWith("https://") || false;

const session: NextAuthConfig['session'] = {
  strategy: 'jwt',
  maxAge: 30 * 60 //30mins
};

const cookies: NextAuthConfig['cookies'] = {
  sessionToken: {
    name: COOKIE_SESSION_TOKEN,
    options: {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: useSecureCookies
    }
  }
};

const callbacks: NextAuthConfig['callbacks'] = {
  jwt: jwtCallback,
  session: sessionCallback,
  authorized: authorizedCallback
};

const pages: NextAuthConfig['pages'] = {
  signIn: SIGNIN_PATH
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
  pages
}