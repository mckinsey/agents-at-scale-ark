'use client';

import { useSearchParams } from 'next/navigation';
import type { PropsWithChildren } from 'react';
import { createContext, useContext, useEffect, useMemo } from 'react';
import { toast } from 'sonner';

import { useGetContext } from '@/lib/services/namespaces-hooks';

interface NamespaceContext {
  isPending: boolean;
  namespace: string;
  isNamespaceResolved: boolean;
  readOnlyMode: boolean;
}

type FallbackReason = 'unreachable' | 'unavailable';

interface NamespaceResolution {
  namespace: string;
  isNamespaceResolved: boolean;
  readOnlyMode: boolean;
  fallbackReason: FallbackReason | null;
}

interface ContextErrorPayload {
  data?: {
    detail?: {
      default_namespace?: string;
    };
  };
}

const FALLBACK_NAMESPACE = 'default';

const NamespaceContext = createContext<NamespaceContext | undefined>(undefined);

function readFallbackNamespace(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('data' in error)) {
    return null;
  }

  const payload = error as ContextErrorPayload;
  return payload.data?.detail?.default_namespace || null;
}

function NamespaceProvider({ children }: PropsWithChildren) {
  const searchParams = useSearchParams();
  const namespaceFromQueryParams = searchParams.get('namespace');

  // 1. If ?namespace is provided, try to validate it by passing to API
  // 2. If no ?namespace OR validation fails, API will return pod's default namespace
  // 3. Final fallback is 'default' if API call fails entirely
  const { data, isPending, error } = useGetContext(
    namespaceFromQueryParams || undefined,
  );

  const resolution = useMemo<NamespaceResolution>(() => {
    if (data) {
      return {
        namespace: data.namespace || FALLBACK_NAMESPACE,
        isNamespaceResolved: true,
        readOnlyMode: data.read_only_mode ?? false,
        fallbackReason: null,
      };
    }

    if (error) {
      const fallbackNamespace = readFallbackNamespace(error);
      return {
        namespace: fallbackNamespace || FALLBACK_NAMESPACE,
        isNamespaceResolved: true,
        readOnlyMode: true,
        fallbackReason: fallbackNamespace ? 'unreachable' : 'unavailable',
      };
    }

    return {
      namespace: '',
      isNamespaceResolved: false,
      readOnlyMode: true,
      fallbackReason: null,
    };
  }, [data, error]);

  const { namespace, isNamespaceResolved, readOnlyMode, fallbackReason } =
    resolution;

  // Keep the URL agreeing with the namespace actually in use, so a refresh, a
  // bookmark, or a shared link resolves to the same namespace.
  //
  // The replacement URL is query-only and relative on purpose. globalThis.history
  // is the native History API, so it does not apply the configured base path
  // the way next/link and the router do, and usePathname() returns the
  // base-path-stripped value. Building `${pathname}?${params}` would therefore
  // drop the prefix under ARK_DASHBOARD_BASE_PATH. A bare `?...` is resolved by
  // the browser against the current URL, keeping the prefix intact.
  //
  // Server Components do not observe replaceState updates, so nothing rendered
  // on the server may read `namespace` from searchParams.
  useEffect(() => {
    if (!isNamespaceResolved) {
      return;
    }
    if (searchParams.get('namespace') === namespace) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.set('namespace', namespace);
    globalThis.history.replaceState(null, '', `?${params.toString()}`);
  }, [isNamespaceResolved, namespace, searchParams]);

  // Guarded on the requested namespace differing from the resolved one: the
  // write-back above rewrites the query param, which would otherwise re-fire
  // this toast for a substitution the user has already been told about.
  useEffect(() => {
    if (fallbackReason !== 'unreachable') {
      return;
    }
    if (!namespaceFromQueryParams || namespaceFromQueryParams === namespace) {
      return;
    }
    toast.error(`Namespace "${namespaceFromQueryParams}" not accessible`, {
      description: `Using ${namespace} instead`,
    });
  }, [fallbackReason, namespace, namespaceFromQueryParams]);

  useEffect(() => {
    if (fallbackReason !== 'unavailable') {
      return;
    }
    toast.error('Failed to get namespace context', {
      description: 'Using default namespace',
    });
  }, [fallbackReason]);

  useEffect(() => {
    if (!data && !isPending && !error) {
      toast.error('Failed to get namespace', {
        description: 'An unexpected error occurred',
      });
    }
  }, [data, isPending, error]);

  const context = useMemo<NamespaceContext>(
    () => ({
      isPending,
      namespace,
      isNamespaceResolved,
      readOnlyMode,
    }),
    [isPending, namespace, isNamespaceResolved, readOnlyMode],
  );

  return (
    <NamespaceContext.Provider value={context}>
      {children}
    </NamespaceContext.Provider>
  );
}

function useNamespace() {
  const context = useContext(NamespaceContext);
  if (!context) {
    throw new Error('useNamespace must be used within a NamespaceProvider');
  }

  return context;
}

export { NamespaceProvider, useNamespace };
