'use client';

import { useAtomValue } from 'jotai';

import { isMarketplaceInstallEnabledAtom } from '@/atoms/experimental-features';

export function useMarketplaceInstallCapability(): boolean {
  return useAtomValue(isMarketplaceInstallEnabledAtom);
}
