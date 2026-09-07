import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { namespacesService } from './namespaces';

export const GET_CONTEXT_QUERY_KEY = 'get-context';
export const GET_ALL_NAMESPACES_QUERY_KEY = 'get-all-namespaces';

// Only has to outlive the write-back, which lands in the same tick as the
// response that triggers it. Keep it short: a key change on a mounted observer
// refetches on staleness alone, and both providers reading this query sit above
// the routed tree in GlobalProviders, so they never remount and refetchOnMount
// never fires for a navigation. A long window would leave a real namespace
// switch showing the previous namespace's permissions and read-only mode.
const CONTEXT_SEED_STALE_TIME_MS = 1_000;

export const useGetContext = (namespace?: string, enabled = true) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [GET_CONTEXT_QUERY_KEY, namespace],
    queryFn: () => namespacesService.getContext(namespace),
    enabled,
    staleTime: CONTEXT_SEED_STALE_TIME_MS,
  });

  const { data } = query;
  const resolvedNamespace = data?.namespace;

  // NamespaceProvider writes the resolved namespace into the URL, which selects
  // a different key here. Seed that key with the response already in hand: a
  // load with no ?namespace= would otherwise fetch /v1/context twice and blank
  // `data` in between, dropping the dashboard behind its loading gate.
  useEffect(() => {
    if (!resolvedNamespace || resolvedNamespace === namespace) {
      return;
    }
    queryClient.setQueryData([GET_CONTEXT_QUERY_KEY, resolvedNamespace], data);
  }, [queryClient, namespace, resolvedNamespace, data]);

  return query;
};

export const useGetAllNamespaces = () => {
  return useQuery({
    queryKey: [GET_ALL_NAMESPACES_QUERY_KEY],
    queryFn: namespacesService.getAll,
  });
};

type UseCreateNamespaceProps = {
  onSuccess?: (name: string) => void;
};

export const useCreateNamespace = (props?: UseCreateNamespaceProps) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: namespacesService.create,
    onSuccess: (_, name) => {
      toast.success('Namespace Created', {
        description: `Successfully created namespace ${name}`,
      });

      queryClient.invalidateQueries({ queryKey: [GET_CONTEXT_QUERY_KEY] });

      if (props?.onSuccess) {
        props.onSuccess(name);
      }
    },
    onError: (error, name) => {
      toast.error(`Failed to create Namespace: ${name}`, {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    },
  });
};
