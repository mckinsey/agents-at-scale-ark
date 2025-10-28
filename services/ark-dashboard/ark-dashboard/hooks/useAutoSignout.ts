'use client';

import { useSession } from 'next-auth/react';
import { useEffect } from 'react';

import { signout } from '@/lib/auth/signout';

const fallbackInactivityTimeoutFromEnv = parseInt(
  process.env.NEXT_PUBLIC_FALLBACK_INACTIVITY_TIMEOUT || '',
);
const defaultFallbackInactivityTimeout = 30 * 60 * 1000; //30mins
const fallbackInactivityTimeout = isNaN(fallbackInactivityTimeoutFromEnv)
  ? defaultFallbackInactivityTimeout
  : fallbackInactivityTimeoutFromEnv;

export const useAutoSignout = () => {
  const { data: session } = useSession();

  useEffect(() => {
    if (!session) {
      return;
    }

    const expiresAt = session?.expires
      ? new Date(session?.expires).getTime()
      : Date.now() + fallbackInactivityTimeout;
    const now = Date.now();
    const timeout = expiresAt - now;

    if (timeout > 0) {
      const timer = setTimeout(signout, timeout);
      return () => clearTimeout(timer);
    } else {
      // Already expired
      signout();
    }
  }, [session]);
};
