'use client';

import { LogIn } from 'lucide-react';

import { signout } from '@/lib/auth/signout';

export function SessionExpired() {
  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <div className="bg-card text-card-foreground max-w-md rounded-lg border p-8 text-center shadow-sm">
        <LogIn className="text-muted-foreground mx-auto mb-4 h-10 w-10" />
        <h1 className="mb-2 text-lg font-semibold">Session expired</h1>
        <p className="text-muted-foreground mb-6 text-sm">
          Your sign-in could no longer be verified. Sign in again to continue.
        </p>
        <button
          onClick={() => signout()}
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium transition-colors">
          Sign in again
        </button>
      </div>
    </div>
  );
}
