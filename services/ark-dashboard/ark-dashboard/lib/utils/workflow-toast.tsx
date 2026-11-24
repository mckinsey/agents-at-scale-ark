import { toast } from 'sonner';

import { WorkflowLink } from '@/components/common/workflow-link';

export function showWorkflowStartedToast(workflowName: string) {
  toast.success('Workflow started', {
    action: <WorkflowLink workflowName={workflowName} />,
  });
}
