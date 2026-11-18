'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';

import { DASHBOARD_SECTIONS } from '@/lib/constants';
import { isArgoNotInstalledError } from '@/lib/services/workflow-templates';
import { useGetAllWorkflowTemplates } from '@/lib/services/workflow-templates-hooks';

import { MetricCard } from './metric-card';

export function HomepageWorkflowTemplatesCard() {
  const { data, isPending, error } = useGetAllWorkflowTemplates();

  const argoNotInstalled = isArgoNotInstalledError(error);
  const count = data?.length || 0;

  const section = DASHBOARD_SECTIONS['workflow-templates'];
  const href = `/${section.key}`;

  useEffect(() => {
    if (error && !argoNotInstalled) {
      toast.error('Failed to get Workflow Templates', {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    }
  }, [error, argoNotInstalled]);

  if (argoNotInstalled) {
    return null;
  }

  return (
    <MetricCard
      key={section.key}
      title={section.title}
      value={count}
      href={href}
      isLoading={isPending}
      hasError={Boolean(error)}
    />
  );
}
