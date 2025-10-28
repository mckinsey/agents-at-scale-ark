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

  const { data, isPending, error } = useGetContext();

  const createQueryString = useCallback((name: string, value: string) => {
    const params = new URLSearchParams();
    params.set(name, value);

    return params.toString();
  }, []);

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
      toast.error('Failed to get namespace', {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    }
  }, [error]);

  useEffect(() => {
    if (!data && !isPending) {
      toast.error('Failed to get namespace', {
        description: 'An unexpected error occurred',
      });
    }
  }, [data, isPending]);

  useEffect(() => {
    if (data) {
      if (data.namespace !== namespaceFromQueryParams) {
        setNamespace(data.namespace);
      } else {
        setIsNamespaceResolved(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, namespaceFromQueryParams]);

  const context = useMemo<NamespaceContext>(
    () => ({
      availableNamespaces,
      createNamespace,
      isPending,
      namespace: namespaceFromQueryParams,
      isNamespaceResolved: isNamespaceResolved,
      setNamespace,
    }),
    [
      availableNamespaces,
      createNamespace,
      isPending,
      namespaceFromQueryParams,
      isNamespaceResolved,
      setNamespace,
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
