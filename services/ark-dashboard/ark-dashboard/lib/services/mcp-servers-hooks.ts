import { useQuery } from '@tanstack/react-query';

import { mcpServersService } from './mcp-servers';

export const GET_ALL_MCP_SERVERS_QUERY_KEY = 'get-all-mcp-servers';

export const useGetAllMcpServers = () => {
  return useQuery({
    queryKey: [GET_ALL_MCP_SERVERS_QUERY_KEY],
    queryFn: mcpServersService.getAll,
  });
};
