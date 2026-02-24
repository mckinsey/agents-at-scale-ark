import { useQuery } from '@tanstack/react-query';

import { workflowTemplatesService } from './workflow-templates';

export const GET_ALL_WORKFLOW_TEMPLATES_QUERY_KEY =
  'get-all-workflow-templates';

export const useGetAllWorkflowTemplates = () => {
  return useQuery({
    queryKey: [GET_ALL_WORKFLOW_TEMPLATES_QUERY_KEY],
    queryFn: workflowTemplatesService.list,
  });
};
