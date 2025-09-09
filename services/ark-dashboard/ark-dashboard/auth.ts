import NextAuth from "next-auth";
import type { DefaultSession, Session } from "next-auth";
import { NextResponse } from "next/server";
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

const nextAuth = NextAuth(authConfig);

async function openauth(...args: unknown[]) {
  if (args.length) {
    return NextResponse.next() as unknown as Session;
  }
  return {
    user: {
      id: "anonym",
      name: "anonym",
      email: "anonym"
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
  signIn: nextAuth.signIn,
  signOut: nextAuth.signOut,
  GET: nextAuth.handlers.GET,
  POST: nextAuth.handlers.POST
};

export const { auth, GET, POST, signIn, signOut } =
  process.env.AUTH_MODE === "open" ? open : sso;
