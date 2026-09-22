'use client';

import { useSession } from 'next-auth/react';
import { RedirectType, redirect } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';

import { SIGNIN_PATH } from '@/lib/constants/auth';

import { useConditionalInterval } from './useConditionalInterval';
import { useWindowFocus } from './useWindowFocus';

//Backstop only: the proxy refreshes server-side before every ark-api call.
//Keep this below the shortest access-token lifetime we support (5 mins).
//NEXT_PUBLIC_* is inlined at build time, so this cannot be set at runtime.
const tokenRefreshIntervalFromEnv = parseInt(
  process.env.NEXT_PUBLIC_TOKEN_REFRESH_INTERVAL_MS || '',
);
const defaultTokenRefreshInterval = 4 * 60 * 1000; //4mins
const tokenRefreshInterval = isNaN(tokenRefreshIntervalFromEnv)
  ? defaultTokenRefreshInterval
  : tokenRefreshIntervalFromEnv;

export function useRefreshAccessToken() {
  const { status, update } = useSession();
  const isUpdatingRef = useRef(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const safeUpdate = useCallback(async () => {
    if (isUpdatingRef.current) {
      console.warn(
        '[useRefreshAccessToken] Update already in progress, skipping',
      );
      return;
    }

    if (status === 'loading') {
      console.warn('[useRefreshAccessToken] Cannot update session: loading');
      return;
    }

    try {
      isUpdatingRef.current = true;
      setIsUpdating(true);

      // Do not forward arbitrary data (e.g., click events) to update().
      // Only send the refresh flag to avoid serialization issues.
      console.log('[useRefreshAccessToken] Updating session');
      const result = await update({ shouldRefreshToken: true });

      if (result && 'error' in result && result.error) {
        console.error(
          '[useRefreshAccessToken] Session update failed:',
          result.error,
        );
        redirect(SIGNIN_PATH, RedirectType.replace);
      }
    } catch (error) {
      console.error('[useRefreshAccessToken] Session update error:', error);
      redirect(SIGNIN_PATH, RedirectType.replace);
    } finally {
      isUpdatingRef.current = false;
      setIsUpdating(false);
    }
  }, [status, update]);

  const combinedStatus = isUpdating ? 'updating' : status;

  useWindowFocus({
    onFocus: safeUpdate,
  });

  useConditionalInterval({
    callback: safeUpdate,
    delay: tokenRefreshInterval,
    condition: combinedStatus === 'authenticated',
  });
}
