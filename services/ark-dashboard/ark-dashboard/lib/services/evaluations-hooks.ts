import { useQuery } from "@tanstack/react-query";
import { evaluationsService } from "./evaluations";

export const useGetAllEvaluationsWithDetails = ({
  namespace,
  enhanced = false
}: {
  namespace: string;
  enhanced?: boolean;
}) => {
  return useQuery({
    queryKey: ["get-all-evaluations-with-details", namespace, enhanced],
    queryFn: async () => {
      try {
        // Try enhanced fetch first
        return await evaluationsService.getAllWithDetails(namespace, enhanced);
      } catch {
        // Fallback to basic fetch
        return await evaluationsService.getAll(namespace);
      }
    },
    enabled: !!namespace
  });
};
