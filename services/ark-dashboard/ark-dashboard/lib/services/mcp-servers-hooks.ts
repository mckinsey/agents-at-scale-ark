import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  type LogoutAuthOptions,
  mcpServersService,
  type StartAuthOptions,
} from './mcp-servers';

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
