import NextAuth from 'next-auth';
import type { DefaultSession, Session } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';

import { authConfig } from './lib/auth/auth-config';
import { prefixPathname } from './lib/auth/base-path';

declare module 'next-auth' {
  interface Session {
    user?: {
      id: string;
    } & DefaultSession['user'];
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    provider: string;
    id_token: string;
    access_token?: string;
    refresh_token?: string;
    expires_at: number;
  }
}

export type NextRequestWithAuth = NextRequest & {
  auth?: Session | null;
};

//Used to create a dummy session object when the auth mode is "open"
function getDummySession(): Session {
  return {
    user: {
      id: 'anonym',
      name: 'anonym',
      email: 'anonym',
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), //+1 day
  };
}

//Used to handle incoming auth related requests when the auth mode is "open"
async function dummyRouteHandler() {
  return NextResponse.json(getDummySession());
}

//Used to handle incoming sign in requests when the auth mode is "open"
async function dummySignInHandler() {
  return NextResponse.redirect('/');
}

// Function overloads for openauth
function openauth(
  callback: (req: NextRequestWithAuth) => Promise<NextResponse<unknown>>,
): (req: NextRequestWithAuth) => Promise<NextResponse<unknown>>;
function openauth(): Session;
function openauth(
  callback?: (req: NextRequestWithAuth) => Promise<NextResponse<unknown>>,
) {
  if (callback) {
    return async (req: NextRequestWithAuth) => {
      req.auth = getDummySession();
      return callback(req);
    };
  }
  return getDummySession();
}

// Realign the inbound auth-route pathname with Auth.js's basePath under a tenant
// prefix (see prefixPathname). Next.js strips the prefix before this handler
// runs, so /api/auth/callback/<provider> would otherwise fail Auth.js's action
// parser; the redirect_uri Auth.js emits already carries the prefix, so only the
// inbound side needs fixing. Mirrors next-auth's own reqWithEnvURL, which
// rebuilds the request with a new URL and the original request as init.
function withBasePath(
  handler: (req: NextRequest) => Promise<Response>,
): (req: NextRequest) => Promise<Response> {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  if (!basePath) return handler;
  return (req: NextRequest) => {
    const url = new URL(req.url);
    const realigned = prefixPathname(url.pathname, basePath);
    if (realigned !== url.pathname) {
      url.pathname = realigned;
      req = new NextRequest(url, req);
    }
    return handler(req);
  };
}

function getAuth() {
  if (!process.env.AUTH_MODE || process.env.AUTH_MODE === 'open') {
    return {
      auth: openauth,
      signIn: dummySignInHandler,
      GET: dummyRouteHandler,
      POST: dummyRouteHandler,
    };
  }

  //Init NextAuth only if we are not in "open" mode
  const nextAuth = NextAuth(authConfig);
  return {
    auth: nextAuth.auth,
    signIn: nextAuth.signIn,
    GET: withBasePath(nextAuth.handlers.GET),
    POST: withBasePath(nextAuth.handlers.POST),
  };
}

export const { auth, GET, POST, signIn } = getAuth();
