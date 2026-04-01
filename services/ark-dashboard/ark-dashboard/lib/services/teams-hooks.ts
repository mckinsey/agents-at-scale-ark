import { useQuery } from '@tanstack/react-query';

import { teamsService } from './teams';

export const GET_ALL_TEAMS_QUERY_KEY = 'get-all-teams';

export const useGetAllTeams = () => {
  return useQuery({
    queryKey: [GET_ALL_TEAMS_QUERY_KEY],
    queryFn: teamsService.getAll,
  });
};
