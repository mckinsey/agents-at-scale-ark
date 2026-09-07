'use client';

import { ResourcePageHeader } from '@/components/common/resource-page-header';
import { InsertDriveFile } from '@/components/icons';
import {
  LearnMoreButton,
  ResourceEmptyState,
} from '@/components/sections/resource-list-states';
import { DOCS_URLS } from '@/lib/constants/docs';

export function FilesSetupInstructions() {
  return (
    <div className="content-shell flex h-full w-full flex-col">
      <ResourcePageHeader
        icon={<InsertDriveFile />}
        title="Files"
        description="Manage datasets, documents, and assets used by agents"
      />

      <ResourceEmptyState
        icon={<InsertDriveFile />}
        title="File Gateway Service Not Configured"
        description={
          <>
            <p className="mb-2">Set up the File Gateway Service</p>
            <p>to enable file management capabilities.</p>
          </>
        }
        actions={<LearnMoreButton href={DOCS_URLS.fileGateway} />}
      />
    </div>
  );
}
