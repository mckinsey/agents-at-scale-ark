'use client';

import { useAutoSignout } from '@/hooks/useAutoSignout';
import { useRefreshAccessToken } from '@/hooks/useRefreshAccessToken';

export function AuthUtilsWrapper() {
  useAutoSignout();
  useRefreshAccessToken();

  return null;
}
