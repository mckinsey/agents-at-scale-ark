import { useQuery } from '@tanstack/react-query';

import { mcpServersService } from './mcp-servers';

export const GET_ALL_MCP_SERVERS_QUERY_KEY = 'get-all-mcp-servers';
export const GET_MCP_SERVER_QUERY_KEY = 'get-mcp-server';

export const useGetAllMcpServers = () => {
  return useQuery({
    queryKey: [GET_ALL_MCP_SERVERS_QUERY_KEY],
    queryFn: mcpServersService.getAll,
  });
};

export const useGetMcpServerByName = (name: string) => {
  return useQuery({
    queryKey: [GET_MCP_SERVER_QUERY_KEY, name],
    queryFn: () => mcpServersService.get(name),
    enabled: !!name,
  });
};
