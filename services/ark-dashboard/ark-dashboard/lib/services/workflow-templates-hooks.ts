import { useQuery } from '@tanstack/react-query';

import { useNamespace } from '@/providers/NamespaceProvider';

import { workflowTemplatesService } from './workflow-templates';

export const GET_ALL_WORKFLOW_TEMPLATES_QUERY_KEY =
  'get-all-workflow-templates';

export const useGetAllWorkflowTemplates = () => {
  const { namespace } = useNamespace();

  return useQuery({
    queryKey: [GET_ALL_WORKFLOW_TEMPLATES_QUERY_KEY, namespace],
    queryFn: () => workflowTemplatesService.list(namespace),
    enabled: Boolean(namespace),
  });
};
