import { NextAuthConfig } from "next-auth";
import { createOIDCProvider } from "./create-oidc-provider";
import { TokenManager } from "./token-manager";

export const SESSION_TOKEN = 'ARK-session-token'

export const authConfig: NextAuthConfig = {
  adapter: undefined,
    trustHost: true,
    debug: process.env.AUTH_DEBUG === "true",
    providers: [
      createOIDCProvider({
        clientId: process.env.OIDC_CLIENT_ID,
        issuer: process.env.OIDC_ISSUER_URL,
        name: process.env.OIDC_PROVIDER_NAME || 'unknown',
        id: process.env.OIDC_PROVIDER_ID || 'unknown',
        clientSecret: process.env.OIDC_CLIENT_SECRET
      })
    ],
    session: {
      strategy: 'jwt',
      maxAge: 30 * 60 //30mins
    },
    cookies: {
      sessionToken: {
        name: SESSION_TOKEN
      }
    },
    callbacks: {
        jwt: async ({ token, profile, account, trigger, session }) => {
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
            return await TokenManager.getNewAccessToken(token)
          }
    
          return token
        },
        session: ({ session, token }) => {
          if (session?.user && token?.id) {
            session.user.id = String(token.id);
          }
          return session;
        },
        authorized({ auth: session }) {
          return !!session?.user //When the JWT signed by auth js expires the session becomes null
        }
      },
      pages: {
        signIn: '/api/signin'
      }
}