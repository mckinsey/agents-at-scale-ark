'use client';

import { useState } from 'react';

import { ResourcePageHeader } from '@/components/common/resource-page-header';
import { Terminal } from '@/components/icons';
import { SessionsSection } from '@/components/sections/sessions-section';

export default function WorkflowRunsPage() {
  const [sessionCount, setSessionCount] = useState(0);

  const pageTitle = sessionCount
    ? `Workflow runs (${sessionCount})`
    : 'Workflow runs';

  return (
    <div className="content-shell flex min-h-0 w-full flex-1 flex-col">
      <ResourcePageHeader
        icon={<Terminal />}
        title={pageTitle}
        description="Track workflow execution across agents, tools, and tasks"
      />

      <SessionsSection onCountChange={setSessionCount} />
    </div>
  );
}
