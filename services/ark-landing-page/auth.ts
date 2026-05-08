import NextAuth from 'next-auth';
import type { DefaultSession, Session } from 'next-auth';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { authConfig } from './lib/auth/auth-config';

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

function getDummySession(): Session {
  return {
    user: {
      id: 'anonym',
      name: 'anonym',
      email: 'anonym',
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

async function dummyRouteHandler() {
  return NextResponse.json(getDummySession());
}

async function dummySignInHandler() {
  return NextResponse.redirect('/');
}

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

function getAuth() {
  if (!process.env.AUTH_MODE || process.env.AUTH_MODE === 'open') {
    return {
      auth: openauth,
      signIn: dummySignInHandler,
      GET: dummyRouteHandler,
      POST: dummyRouteHandler,
    };
  }

  const nextAuth = NextAuth(authConfig);
  return {
    auth: nextAuth.auth,
    signIn: nextAuth.signIn,
    GET: nextAuth.handlers.GET,
    POST: nextAuth.handlers.POST,
  };
}

export const { auth, GET, POST, signIn } = getAuth();
