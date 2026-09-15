import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useNamespace } from '@/providers/NamespaceProvider';

import {
  type LogoutAuthOptions,
  mcpServersService,
  type StartAuthOptions,
} from './mcp-servers';

export const GET_ALL_MCP_SERVERS_QUERY_KEY = 'get-all-mcp-servers';
export const GET_MCP_SERVER_QUERY_KEY = 'get-mcp-server';

export const useGetAllMcpServers = () => {
  const { namespace } = useNamespace();

  return useQuery({
    queryKey: [GET_ALL_MCP_SERVERS_QUERY_KEY, namespace],
    queryFn: () => mcpServersService.getAll(namespace),
    enabled: Boolean(namespace),
  });
};

export const useGetMcpServerByName = (name: string) => {
  const { namespace } = useNamespace();

  return useQuery({
    queryKey: [GET_MCP_SERVER_QUERY_KEY, name, namespace],
    queryFn: () => mcpServersService.get(namespace, name),
    enabled: Boolean(name && namespace),
  });
};

export const useStartMcpAuth = () => {
  return useMutation({
    mutationFn: ({
      name,
      options,
    }: {
      name: string;
      options: StartAuthOptions;
    }) => mcpServersService.startAuth(name, options),
  });
};

export const useLogoutMcpAuth = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      name,
      options,
    }: {
      name: string;
      options: LogoutAuthOptions;
    }) => mcpServersService.logoutAuth(name, options),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [GET_ALL_MCP_SERVERS_QUERY_KEY],
      });
    },
  });
};
