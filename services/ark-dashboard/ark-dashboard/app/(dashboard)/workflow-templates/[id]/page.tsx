'use client';

import { useParams } from 'next/navigation';

import { NamespacedLink } from '@/components/namespaced-link';
import { Spinner } from '@/components/ui/spinner';
import { WorkflowStudio } from '@/components/workflow-studio/workflow-studio';
import { useWorkflowTemplateAccess } from '@/lib/hooks/use-workflow-template-access';

export default function WorkflowTemplatePage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';
  const { canUpdate, loading } = useWorkflowTemplateAccess();

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="text-fg-secondary h-6 w-6" />
      </div>
    );
  }

  if (!canUpdate) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
        <p className="text-fg-secondary text-center">
          You don&apos;t have permission to edit workflow templates in this
          namespace.
        </p>
        <NamespacedLink
          href="/workflow-templates"
          className="text-sm underline">
          Back to workflow templates
        </NamespacedLink>
      </div>
    );
  }

  return (
    <div className="-m-10 flex min-h-0 flex-1 flex-col">
      <WorkflowStudio mode="edit" initialName={id} />
    </div>
  );
}
