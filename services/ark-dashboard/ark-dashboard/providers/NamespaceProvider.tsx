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
import { filesApiClient } from '@/lib/api/files-client';
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
  const namespaceFromQueryParams = searchParams.get('namespace');

  const [availableNamespaces] = useState<Namespace[]>([
    {
      name: namespaceFromQueryParams || 'default',
      id: 0,
    },
  ]);
  const [isNamespaceResolved, setIsNamespaceResolved] = useState(false);
  const [readOnlyMode, setReadOnlyMode] = useState(true);
  const [currentNamespace, setCurrentNamespace] = useState<string>('default');

  // 1. If ?namespace is provided, try to validate it by passing to API
  // 2. If no ?namespace OR validation fails, API will return pod's default namespace
  // 3. Final fallback is 'default' if API call fails entirely
  const { data, isPending, error } = useGetContext(namespaceFromQueryParams || undefined);

  useEffect(() => {
    apiClient.setDefaultParam('namespace', currentNamespace);
    filesApiClient.setDefaultParam('namespace', currentNamespace);
  }, [currentNamespace]);

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
      // Try to extract default_namespace from error response (API returns this for 404)
      let fallbackNamespace: string | null = null;

      if (error && typeof error === 'object' && 'data' in error) {
        const errorData = (error as { data?: { detail?: { default_namespace?: string } } }).data;
        fallbackNamespace = errorData?.detail?.default_namespace || null;
      }

      if (fallbackNamespace) {
        // Use the fallback namespace from API error response
        setCurrentNamespace(fallbackNamespace);
        setIsNamespaceResolved(true);

        // Only show error if we had a query param that failed
        if (namespaceFromQueryParams) {
          toast.error(`Namespace "${namespaceFromQueryParams}" not accessible`, {
            description: `Using ${fallbackNamespace} instead`,
          });
        }
      } else {
        // No fallback available, use 'default' as final fallback
        setCurrentNamespace('default');
        setIsNamespaceResolved(true);

        toast.error('Failed to get namespace context', {
          description: 'Using default namespace',
        });
      }
    }
  }, [error, namespaceFromQueryParams]);

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

      // Use the namespace returned by the API
      // This will be the validated query param namespace OR the pod's default namespace
      if (data.namespace) {
        setCurrentNamespace(data.namespace);
      }
    }
  }, [data]);

  const context = useMemo<NamespaceContext>(
    () => ({
      availableNamespaces,
      createNamespace,
      isPending,
      namespace: currentNamespace,
      isNamespaceResolved: isNamespaceResolved,
      setNamespace,
      readOnlyMode,
    }),
    [
      availableNamespaces,
      createNamespace,
      isPending,
      currentNamespace,
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
