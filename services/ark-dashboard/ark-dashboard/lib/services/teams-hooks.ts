import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { toast } from '@/components/ui/sonner';
import { useNamespace } from '@/providers/NamespaceProvider';

import { teamsService } from './teams';

export const GET_ALL_TEAMS_QUERY_KEY = 'get-all-teams';
export const DELETE_TEAM_MUTATION_KEY = 'delete-team';

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
};

export const useGetAllTeams = () => {
  const { namespace } = useNamespace();

  return useQuery({
    queryKey: [GET_ALL_TEAMS_QUERY_KEY, namespace],
    queryFn: () => teamsService.list(namespace),
    enabled: Boolean(namespace),
  });
};

type UseDeleteTeamProps = {
  onSuccess?: () => void;
};

export const useDeleteTeam = (props?: UseDeleteTeamProps) => {
  const queryClient = useQueryClient();
  const { namespace } = useNamespace();

  return useMutation({
    mutationKey: [DELETE_TEAM_MUTATION_KEY],
    mutationFn: (id: number | string) => teamsService.deleteById(namespace, id),
    onSuccess: () => {
      toast.success('Team deleted successfully');
      props?.onSuccess?.();
    },
    onError: error => {
      toast.error('Failed to delete Team', {
        description: getErrorMessage(error),
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [GET_ALL_TEAMS_QUERY_KEY] });
    },
  });
};
