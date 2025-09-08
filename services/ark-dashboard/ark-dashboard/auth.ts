import type { OAuthUserConfig, OIDCConfig } from "@auth/core/providers";
import type { OktaProfile } from "@auth/core/providers/okta";
import NextAuth from "next-auth";
import type { DefaultSession, Session } from "next-auth";
import { NextResponse } from "next/server";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      idToken: string;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
   interface JWT {
        provider: string;
        id_token: string;
    }
}

function OIDCProvider<TP extends OktaProfile>(
  options: OAuthUserConfig<TP> & {name: string, id: string}
): OIDCConfig<TP> {
  return {
    type: "oidc",
    wellKnown: `${options.issuer}/.well-known/openid-configuration`,
    authorization: { params: { scope: "openid email profile" } },
    checks: ["pkce", "state"],
    ...options
  };
}

const nextAuth = NextAuth({
  adapter: undefined,
  trustHost: true,
  debug: process.env.AUTH_DEBUG === "true",
  providers: [
    OIDCProvider({
      clientId: process.env.OIDC_CLIENT_ID,
      issuer: process.env.OIDC_ISSUER_URL,
      name: process.env.OIDC_PROVIDER_NAME || 'unknown',
      id: process.env.OIDC_PROVIDER_ID || 'unknown',
      clientSecret: process.env.OIDC_CLIENT_SECRET
    })
  ],
  callbacks: {
    jwt({ token, profile, account }) {
      if (profile) {
        token.image = profile.avatar_url || profile.picture;
      }

      // Store the access token from the OIDC provider
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.exp = account.expires_at;
      }

      if(account?.id_token){
        token.id_token = account.id_token;
      }

      return token;
    },
    session: ({ session, token }) => {
      if (session?.user && token?.id) {
        session.user.id = String(token.id);
      }

      if (token.id_token) {
        session.user.idToken = token.id_token;  // expose it in the session object
      }

      return session;
    },
    authorized({ auth: session }) {
      return !!session?.user; // this ensures there is a logged in user for -every- request
    }
  },
  pages: {
    signIn: '/api/signin'
  }
});

async function openauth(...args: unknown[]) {
  if (args.length) {
    return NextResponse.next() as unknown as Session;
  }
  return {
    user: {
      id: "anonym",
      name: "anonym",
      email: "anonym",
      idToken: ""
    },
    expires: ""
  };
};

const sso = {
  auth: nextAuth.auth,
  signIn: nextAuth.signIn,
  signOut: nextAuth.signOut,
  GET: nextAuth.handlers.GET,
  POST: nextAuth.handlers.POST
};

const open = {
  auth: openauth,
  GET: nextAuth.handlers.GET,
  POST: nextAuth.handlers.POST,
  signIn: nextAuth.signIn,
  signOut: nextAuth.signOut
};

export const { auth, GET, POST, signIn, signOut } =
  process.env.AUTH_MODE === "open" ? open : sso;
