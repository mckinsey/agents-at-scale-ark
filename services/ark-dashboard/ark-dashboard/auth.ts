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
    GET: nextAuth.handlers.GET,
    POST: nextAuth.handlers.POST,
  };
}

export const { auth, GET, POST, signIn } = getAuth();
