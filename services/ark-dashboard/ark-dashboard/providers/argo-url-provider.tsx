'use client';

import type { PropsWithChildren } from 'react';
import { createContext, useContext } from 'react';

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

export function useArgoUrl(): string | undefined {
  return useContext(ArgoUrlContext);
}
