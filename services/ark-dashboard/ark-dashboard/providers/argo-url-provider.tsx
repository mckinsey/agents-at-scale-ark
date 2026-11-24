'use client';

import type { PropsWithChildren } from 'react';
import { createContext, useContext, useMemo } from 'react';

import { type ArgoLinks, createArgoLinks } from '@/lib/utils/argo-url';

const ArgoUrlContext = createContext<string | undefined>(undefined);

interface ArgoUrlProviderProps extends PropsWithChildren {
  readonly argoUrl: string | undefined;
}

export function ArgoUrlProvider({ argoUrl, children }: ArgoUrlProviderProps) {
  return (
    <ArgoUrlContext.Provider value={argoUrl}>
      {children}
    </ArgoUrlContext.Provider>
  );
}

export function useArgoLinks(): ArgoLinks | undefined {
  const argoUrl = useContext(ArgoUrlContext);
  return useMemo(() => createArgoLinks(argoUrl), [argoUrl]);
}
