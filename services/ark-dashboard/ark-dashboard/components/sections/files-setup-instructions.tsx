'use client';

import { ExternalLink } from 'lucide-react';

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { DASHBOARD_SECTIONS } from '@/lib/constants';

export function FilesSetupInstructions() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <DASHBOARD_SECTIONS.files.icon />
          </EmptyMedia>
          <EmptyTitle>File Gateway Service Not Configured</EmptyTitle>
          <EmptyDescription>
            Set up the{' '}
            <a
              href="https://mckinsey.github.io/agents-at-scale-marketplace/services/file-gateway/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary/80 inline-flex items-center gap-1 font-medium transition-colors">
              File Gateway Service
              <ExternalLink className="h-3 w-3" />
            </a>{' '}
            to enable file management capabilities.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent></EmptyContent>
      </Empty>
    </div>
  );
}
