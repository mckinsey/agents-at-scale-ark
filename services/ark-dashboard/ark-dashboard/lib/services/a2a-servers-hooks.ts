import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useNamespace } from '@/providers/NamespaceProvider';

import { A2AServersService } from './a2a-servers';
import type { A2AServerConfiguration } from './a2a-servers';

export const A2A_SERVERS_QUERY_KEY = 'a2a-servers';

export function useListA2AServers() {
  const { namespace } = useNamespace();

  return useQuery({
    queryKey: [A2A_SERVERS_QUERY_KEY, namespace],
    queryFn: () => A2AServersService.getAll(namespace),
    enabled: Boolean(namespace),
  });
}

export function useA2AServer(name: string) {
  const { namespace } = useNamespace();

  return useQuery({
    queryKey: [A2A_SERVERS_QUERY_KEY, name, namespace],
    queryFn: () => A2AServersService.get(namespace, name),
    enabled: Boolean(name && namespace),
  });
}

export function useCreateA2AServer() {
  const { namespace } = useNamespace();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (config: A2AServerConfiguration) =>
      A2AServersService.create(namespace, config),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [A2A_SERVERS_QUERY_KEY] }),
  });
}

export function useDeleteA2AServer() {
  const { namespace } = useNamespace();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (identifier: string) =>
      A2AServersService.delete(namespace, identifier),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [A2A_SERVERS_QUERY_KEY] }),
  });
}
