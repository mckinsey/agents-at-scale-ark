'use client';

import { ArrowUpRightIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { DASHBOARD_SECTIONS } from '@/lib/constants';
import { ARGO_WORKFLOWS_DOCS_URL } from '@/lib/constants/workflows';

export function WorkflowTemplatesNotInstalled() {
  const WorkflowIcon = DASHBOARD_SECTIONS['workflow-templates'].icon;

  return (
    <Empty data-testid="workflow-templates-not-installed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <WorkflowIcon />
        </EmptyMedia>
        <EmptyTitle>Argo Workflows isn&apos;t installed</EmptyTitle>
        <EmptyDescription>
          Workflow templates require Argo Workflows, which isn&apos;t installed
          in this cluster. Install it to get started.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent></EmptyContent>
      <Button
        variant="ghost"
        asChild
        className="text-muted-foreground"
        size="sm">
        <a href={ARGO_WORKFLOWS_DOCS_URL} target="_blank" rel="noreferrer">
          Learn how to install Argo Workflows <ArrowUpRightIcon />
        </a>
      </Button>
    </Empty>
  );
}
