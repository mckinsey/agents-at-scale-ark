'use client';

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
          <EmptyTitle>Filesystem MCP Not Configured</EmptyTitle>
          <EmptyDescription>
            Set up the Filesystem MCP server to enable file management
            capabilities.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent></EmptyContent>
      </Empty>
    </div>
  );
}
