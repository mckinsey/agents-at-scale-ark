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
  useGetAllNamespaces,
  useGetContext,
} from '@/lib/services/namespaces-hooks';

interface NamespaceContext {
  availableNamespaces: Namespace[];
  capabilities: { can_create_namespace: boolean };
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

  const [isNamespaceResolved, setIsNamespaceResolved] = useState(false);
  const [readOnlyMode, setReadOnlyMode] = useState(true);
  const [capabilities, setCapabilities] = useState<{
    can_create_namespace: boolean;
  }>({ can_create_namespace: false });

  const { data, isPending, error } = useGetContext(namespaceFromQueryParams);
  const {
    data: namespacesData,
    isPending: isNamespacesPending,
    error: namespacesError,
  } = useGetAllNamespaces();

  const availableNamespaces = useMemo<Namespace[]>(() => {
    return namespacesData || [];
  }, [namespacesData]);

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
    if (namespacesError) {
      toast.error('Failed to load namespaces', {
        description:
          namespacesError instanceof Error
            ? namespacesError.message
            : 'An unexpected error occurred',
      });
    }
  }, [namespacesError]);

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
    if (
      !isNamespacesPending &&
      namespacesData &&
      namespaceFromQueryParams !== 'default'
    ) {
      const namespaceExists = namespacesData.some(
        ns => ns.name === namespaceFromQueryParams,
      );

      if (!namespaceExists) {
        toast.error(`Namespace does not exist`, {
          description: `The namespace "${namespaceFromQueryParams}" does not exist. Redirecting to default namespace.`,
        });
        setNamespace('default');
        return;
      }
    }
  }, [
    isNamespacesPending,
    namespacesData,
    namespaceFromQueryParams,
    setNamespace,
  ]);

  useEffect(() => {
    if (data) {
      if (data.namespace !== namespaceFromQueryParams) {
        setNamespace(data.namespace);
      } else {
        setIsNamespaceResolved(true);
      }
      const newReadOnlyMode = data.read_only_mode ?? false;
      setReadOnlyMode(newReadOnlyMode);
      if (data.capabilities) {
        setCapabilities(data.capabilities);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, namespaceFromQueryParams]);

  const context = useMemo<NamespaceContext>(
    () => ({
      availableNamespaces,
      capabilities,
      createNamespace,
      isPending: isPending || isNamespacesPending,
      namespace: namespaceFromQueryParams,
      isNamespaceResolved: isNamespaceResolved,
      setNamespace,
      readOnlyMode,
    }),
    [
      availableNamespaces,
      capabilities,
      createNamespace,
      isPending,
      isNamespacesPending,
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
