import NextAuth from "next-auth";
import type { DefaultSession, Session } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authConfig } from "./lib/auth/auth-config";

declare module "next-auth" {
  interface Session {
    user?: {
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
   interface JWT {
        provider: string;
        id_token: string;
        access_token?: string;
        refresh_token?: string;
        expires_at: number;
    }
}

export type NextRequestWithAuth = NextRequest & {
  auth?: Session | null
}

const nextAuth = NextAuth(authConfig);

function getDummySession(): Session {
  return {
    user: {
      id: "anonym",
      name: "anonym",
      email: "anonym"
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() //+1 day
  }
}

async function dummyRouteHandler() {
  return NextResponse.json(getDummySession())
}

// Function overloads for openauth
function openauth(callback: (req: NextRequestWithAuth) => Promise<NextResponse<unknown>>): (req: NextRequestWithAuth) => Promise<NextResponse<unknown>>;
function openauth(): Session;
function openauth(callback?: (req: NextRequestWithAuth) => Promise<NextResponse<unknown>>) {
  if (callback) {
    return async (req: NextRequestWithAuth) => {
      req.auth = getDummySession();
      return callback(req)
    }
  }
  return getDummySession()
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
  signIn: nextAuth.signIn,
  signOut: nextAuth.signOut,
  GET: dummyRouteHandler,
  POST: dummyRouteHandler
};

export const { auth, GET, POST, signIn, signOut } =
  process.env.AUTH_MODE === "open" ? open : sso;
