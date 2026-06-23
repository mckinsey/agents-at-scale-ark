'use client';

import { useSearchParams } from 'next/navigation';
import type { PropsWithChildren, ReactNode } from 'react';
import { createContext, useContext, useMemo } from 'react';

import { AccessDenied } from '@/components/access/access-denied';
import { ClusterUnavailable } from '@/components/access/cluster-unavailable';
import { SessionExpired } from '@/components/access/session-expired';
import { APIError } from '@/lib/api/client';
import { hasEssentialAccess, missingEssential } from '@/lib/permissions';
import type { ContextResponse, Permissions } from '@/lib/services/namespaces';
import { useGetContext } from '@/lib/services/namespaces-hooks';
import { useUser } from '@/providers/UserProvider';

function isUnauthorized(error: unknown): error is APIError {
  return error instanceof APIError && error.status === 401;
}

interface ContextValue {
  context?: ContextResponse;
  permissions?: Permissions | null;
  isPending: boolean;
  error: unknown;
}

const Context = createContext<ContextValue | undefined>(undefined);

interface Props {
  // Access gating only applies when auth is enabled. In open mode the preflight
  // cannot identify a user, so the gate is disabled and /v1/context isn't fetched.
  enabled?: boolean;
}

function ContextProvider({ children, enabled = false }: PropsWithChildren<Props>) {
  const searchParams = useSearchParams();
  const namespaceFromQueryParams = searchParams.get('namespace');
  const { user } = useUser();

  const { data, isPending, error } = useGetContext(
    namespaceFromQueryParams || undefined,
    enabled,
  );

  const permissions = data?.permissions;

  // permissions is derived from data, so data is the only dependency that matters.
  const value = useMemo<ContextValue>(
    () => ({ context: data, permissions: data?.permissions, isPending, error }),
    [data, isPending, error],
  );

  let gate: ReactNode = null;
  if (!enabled) {
    gate = null;
  } else if (isUnauthorized(error)) {
    // A failed token (e.g. IdP key rotation, expired session) 401s /v1/context;
    // prompt re-auth instead of falling through to a wall of broken cards.
    gate = <SessionExpired />;
  } else if (permissions?.status === 'unavailable') {
    gate = (
      <ClusterUnavailable
        namespace={data?.namespace}
        reason={permissions.reason}
      />
    );
  } else if (permissions?.status === 'ok' && !hasEssentialAccess(permissions)) {
    gate = (
      <AccessDenied
        namespace={data?.namespace}
        email={user?.email}
        missing={missingEssential(permissions)}
      />
    );
  }

  return <Context.Provider value={value}>{gate ?? children}</Context.Provider>;
}

function useArkContext() {
  const context = useContext(Context);
  if (!context) {
    throw new Error('useArkContext must be used within a ContextProvider');
  }

  return context;
}

export { ContextProvider, useArkContext };
