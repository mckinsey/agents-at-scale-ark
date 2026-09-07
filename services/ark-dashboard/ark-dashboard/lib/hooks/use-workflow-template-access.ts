'use client';

import { useEffect, useState } from 'react';

import { workflowTemplatesService } from '@/lib/services/workflow-templates';
import { useNamespace } from '@/providers/NamespaceProvider';

export interface WorkflowTemplateAccess {
  canCreate: boolean;
  canUpdate: boolean;
  loading: boolean;
}

export function useWorkflowTemplateAccess(): WorkflowTemplateAccess {
  const { namespace } = useNamespace();
  const [canCreate, setCanCreate] = useState(false);
  const [canUpdate, setCanUpdate] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setCanCreate(false);
    setCanUpdate(false);

    Promise.allSettled([
      workflowTemplatesService.canCreate(namespace),
      workflowTemplatesService.canUpdate(namespace),
    ]).then(([createResult, updateResult]) => {
      if (cancelled) {
        return;
      }

      setCanCreate(
        createResult.status === 'fulfilled' && createResult.value === true,
      );
      setCanUpdate(
        updateResult.status === 'fulfilled' && updateResult.value === true,
      );
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [namespace]);

  return { canCreate, canUpdate, loading };
}
