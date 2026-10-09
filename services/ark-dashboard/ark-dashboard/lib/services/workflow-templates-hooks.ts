import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { toast } from '@/components/ui/sonner';
import { retryQueryHandler } from '@/lib/utils/query-retry';
import { useNamespace } from '@/providers/NamespaceProvider';

import { getErrorMessage } from './resource-error-message';
import { workflowTemplatesService } from './workflow-templates';

export const GET_ALL_WORKFLOW_TEMPLATES_QUERY_KEY =
  'get-all-workflow-templates';
export const DELETE_WORKFLOW_TEMPLATE_MUTATION_KEY = 'delete-workflow-template';

export const useGetAllWorkflowTemplates = () => {
  const { namespace } = useNamespace();

  return useQuery({
    queryKey: [GET_ALL_WORKFLOW_TEMPLATES_QUERY_KEY, namespace],
    queryFn: () => workflowTemplatesService.list(namespace),
    enabled: Boolean(namespace),
    retry: retryQueryHandler,
  });
};

type UseDeleteWorkflowTemplateProps = {
  onSuccess?: () => void;
};

export const useDeleteWorkflowTemplate = (
  props?: UseDeleteWorkflowTemplateProps,
) => {
  const queryClient = useQueryClient();
  const { namespace } = useNamespace();

  return useMutation({
    mutationKey: [DELETE_WORKFLOW_TEMPLATE_MUTATION_KEY],
    mutationFn: (name: string) =>
      workflowTemplatesService.delete(namespace, name),
    onSuccess: () => {
      toast.success('Workflow Template deleted successfully');
      props?.onSuccess?.();
    },
    onError: error => {
      toast.error('Failed to delete Workflow Template', {
        description: getErrorMessage(error),
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [GET_ALL_WORKFLOW_TEMPLATES_QUERY_KEY],
      });
    },
  });
};
