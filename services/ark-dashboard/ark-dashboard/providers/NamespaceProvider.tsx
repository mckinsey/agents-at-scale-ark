'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { PropsWithChildren } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { toast } from 'sonner';

import { apiClient } from '@/lib/api/client';
import type { Namespace } from '@/lib/services';
import {
  useCreateNamespace,
  useGetContext,
} from '@/lib/services/namespaces-hooks';

interface NamespaceContext {
  availableNamespaces: Namespace[];
  createNamespace: (name: string) => void;
  isPending: boolean;
  namespace: string;
  isNamespaceResolved: boolean;
  setNamespace: (namespace: string) => void;
  readOnlyMode: boolean;
}

const NamespaceContext = createContext<NamespaceContext | undefined>(undefined);

function NamespaceProvider({ children }: PropsWithChildren) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const namespaceFromQueryParams = searchParams.get('namespace') || 'default';

  const [availableNamespaces] = useState<Namespace[]>([
    {
      name: namespaceFromQueryParams,
      id: 0,
    },
  ]);
  const [isNamespaceResolved, setIsNamespaceResolved] = useState(false);
  const [readOnlyMode, setReadOnlyMode] = useState(true);

  const { data, isPending, error } = useGetContext(namespaceFromQueryParams);

  useEffect(() => {
    apiClient.setDefaultParam('namespace', namespaceFromQueryParams);
  }, [namespaceFromQueryParams]);

  const createQueryString = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set(name, value);

      return params.toString();
    },
    [searchParams],
  );

  const setNamespace = useCallback(
    (namespace: string) => {
      const newQueryParams = createQueryString('namespace', namespace);
      router.push(pathname + '?' + newQueryParams);
    },
    [pathname, router, createQueryString],
  );

  const { mutate } = useCreateNamespace({
    onSuccess: setNamespace,
  });

  const createNamespace = useCallback(
    (name: string) => {
      mutate(name);
    },
    [mutate],
  );

  useEffect(() => {
    if (error) {
      // Try to extract default_namespace from the 404 error response
      // APIError has: { message, status, data: { detail: { default_namespace } } }
      let defaultNamespace: string | null = null;

      if (error && typeof error === 'object' && 'data' in error) {
        const errorData = (error as { data?: { detail?: { default_namespace?: string } } }).data;
        defaultNamespace = errorData?.detail?.default_namespace || null;
      }

      if (defaultNamespace && namespaceFromQueryParams !== defaultNamespace) {
        toast.error(`Namespace "${namespaceFromQueryParams}" not found`, {
          description: `Redirecting to ${defaultNamespace}...`,
        });
        setNamespace(defaultNamespace);
      } else if (!defaultNamespace && namespaceFromQueryParams !== 'default') {
        // Fallback to 'default' if we couldn't parse the default namespace
        toast.error(`Namespace "${namespaceFromQueryParams}" not found`, {
          description: 'Redirecting to default namespace...',
        });
        setNamespace('default');
      } else {
        toast.error('Failed to get namespace', {
          description:
            error instanceof Error
              ? error.message
              : 'An unexpected error occurred',
        });
      }
    }
  }, [error, namespaceFromQueryParams, setNamespace]);

  useEffect(() => {
    if (!data && !isPending && !error) {
      toast.error('Failed to get namespace', {
        description: 'An unexpected error occurred',
      });
    }
  }, [data, isPending, error]);

  useEffect(() => {
    if (data) {
      setIsNamespaceResolved(true);
      const newReadOnlyMode = data.read_only_mode ?? false;
      setReadOnlyMode(newReadOnlyMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const context = useMemo<NamespaceContext>(
    () => ({
      availableNamespaces,
      createNamespace,
      isPending,
      namespace: namespaceFromQueryParams,
      isNamespaceResolved: isNamespaceResolved,
      setNamespace,
      readOnlyMode,
    }),
    [
      availableNamespaces,
      createNamespace,
      isPending,
      namespaceFromQueryParams,
      isNamespaceResolved,
      setNamespace,
      readOnlyMode,
    ],
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
