/**
 * React Query hooks for query approvals
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApprovalDetails, submitApproval, type ApprovalDetails } from './query-approvals';

/**
 * Hook to fetch approval details for a query
 */
export function useGetApprovalDetails(queryName: string, namespace: string, enabled = true) {
  return useQuery<ApprovalDetails>({
    queryKey: ['approval-details', namespace, queryName],
    queryFn: () => getApprovalDetails(queryName, namespace),
    enabled,
    // Don't refetch automatically to avoid polling unless needed
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Retry once on failure
    retry: 1,
  });
}

/**
 * Hook to submit approval action (approve/reject)
 */
export function useSubmitApproval(queryName: string, namespace: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (action: 'approved' | 'rejected') => submitApproval(queryName, namespace, action),
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['approval-details', namespace, queryName] });
      queryClient.invalidateQueries({ queryKey: ['queries', namespace, queryName] });
      queryClient.invalidateQueries({ queryKey: ['conversations', queryName] });
    },
  });
}
