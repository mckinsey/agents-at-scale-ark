import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { mcpServersService } from './mcp-servers';

export const GET_ALL_MCP_SERVERS_QUERY_KEY = 'get-all-mcp-servers';

export const useGetAllMcpServers = () => {
  return useQuery({
    queryKey: [GET_ALL_MCP_SERVERS_QUERY_KEY],
    queryFn: mcpServersService.getAll,
  });
};

export const useStartMcpAuth = () => {
  return useMutation({
    mutationFn: ({
      name,
      namespace,
      force,
    }: {
      name: string;
      namespace: string;
      force?: boolean;
    }) => mcpServersService.startAuth(name, { namespace, force }),
  });
};

export const useLogoutMcpAuth = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ name, namespace }: { name: string; namespace: string }) =>
      mcpServersService.logoutAuth(name, { namespace }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [GET_ALL_MCP_SERVERS_QUERY_KEY],
      });
    },
  });
};
