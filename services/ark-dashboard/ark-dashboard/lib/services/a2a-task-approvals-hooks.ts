import { useMutation, useQueryClient } from '@tanstack/react-query';

import { type ApprovalDecision, submitApproval } from './a2a-task-approvals';

export function useSubmitApproval(taskName: string, namespace: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (decision: ApprovalDecision) =>
      submitApproval(taskName, namespace, decision),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['a2a-tasks', taskName] });
      queryClient.invalidateQueries({ queryKey: ['queries'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
