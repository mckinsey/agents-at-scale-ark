import { useQuery } from '@tanstack/react-query';

import { evaluationsService } from './evaluations';

type Props = {
  enhanced?: boolean;
};

export const useGetAllEvaluationsWithDetails = ({
  enhanced = false,
}: Props) => {
  return useQuery({
    queryKey: ['get-all-evaluations-with-details', enhanced],
    queryFn: async () => {
      return await evaluationsService.getAll(enhanced);
    },
  });
};
