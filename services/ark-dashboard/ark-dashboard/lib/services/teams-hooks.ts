import { useQuery } from '@tanstack/react-query';

import { teamsService } from './teams';

export const GET_ALL_TEAMS_QUERY_KEY = 'get-all-teams';

export const useGetAllTeams = (namespace?: string) => {
  return useQuery({
    queryKey: [GET_ALL_TEAMS_QUERY_KEY, namespace],
    queryFn: () => teamsService.getAll(namespace),
  });
};
