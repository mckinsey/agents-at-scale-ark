'use client';

import { useSearchParams } from 'next/navigation';

import { Spinner } from '@/components/ui/spinner';
import { WorkflowStudio } from '@/components/workflow-studio/workflow-studio';
import { useWorkflowTemplateAccess } from '@/lib/hooks/use-workflow-template-access';

export default function NewWorkflowTemplatePage() {
  const searchParams = useSearchParams();
  const nameParam = searchParams.get('name') ?? undefined;
  const titleParam = searchParams.get('title') ?? undefined;
  const descriptionParam = searchParams.get('description') ?? undefined;
  const { canCreate, loading } = useWorkflowTemplateAccess();

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="text-fg-secondary h-6 w-6" />
      </div>
    );
  }

  if (!canCreate) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-fg-secondary text-center">
          You don&apos;t have permission to create workflow templates in this
          namespace.
        </p>
      </div>
    );
  }

  return (
    <div className="-m-10 flex min-h-0 flex-1 flex-col">
      <WorkflowStudio
        mode="new"
        initialName={nameParam}
        initialTitle={titleParam}
        initialDescription={descriptionParam}
      />
    </div>
  );
}
