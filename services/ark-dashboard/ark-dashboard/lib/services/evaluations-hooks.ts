import { useQuery } from '@tanstack/react-query';

import { evaluationsService } from './evaluations';

type Props = {
  enhanced?: boolean;
};

export const useGetAllEvaluationsWithDetails = ({
  enhanced = false,
  namespace,
}: Props & { namespace?: string }) => {
  return useQuery({
    queryKey: ['get-all-evaluations-with-details', enhanced, namespace],
    queryFn: async () => {
      try {
        // Try enhanced fetch first
        return await evaluationsService.getAllWithDetails(enhanced);
      } catch {
        // Fallback to basic fetch
        return await evaluationsService.getAll(namespace);
      }
    },
  });
};
