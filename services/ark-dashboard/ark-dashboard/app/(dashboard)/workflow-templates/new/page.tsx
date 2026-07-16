'use client';

import { Loader2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

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
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!canCreate) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-muted-foreground text-center">
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
