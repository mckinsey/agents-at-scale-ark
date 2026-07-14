'use client';

import { InsertDriveFile } from '@/components/icons';
import { ResourceEmptyState } from '@/components/sections/resource-list-states';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';

const FILE_GATEWAY_DOCS_URL =
  'https://mckinsey.github.io/agents-at-scale-marketplace/services/file-gateway/';

export function FilesSetupInstructions() {
  return (
    <div className="content-shell flex h-full w-full flex-col">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <IconShell size="default" variant="primary">
            <InsertDriveFile />
          </IconShell>
          <h1 className="text-fg-primary text-2xl leading-8 tracking-[-0.096px]">
            Files
          </h1>
        </div>
        <p className="text-fg-secondary text-sm leading-5 tracking-[-0.028px]">
          Manage datasets, documents, and assets used by agents
        </p>
      </div>

      <ResourceEmptyState
        icon={<InsertDriveFile />}
        title="File Gateway Service Not Configured"
        description={
          <>
            <p className="mb-2">Set up the File Gateway Service</p>
            <p>to enable file management capabilities.</p>
          </>
        }
        actions={
          <a
            href={FILE_GATEWAY_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer">
            <Button variant="outline">Learn more</Button>
          </a>
        }
      />
    </div>
  );
}
