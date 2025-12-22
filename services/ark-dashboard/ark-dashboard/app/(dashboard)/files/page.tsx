'use client';

import { useAtomValue } from 'jotai';
import { RefreshCw } from 'lucide-react';
import { useRef } from 'react';

import { isFilesBrowserAvailableAtom } from '@/atoms/experimental-features';
import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { FilesSection } from '@/components/sections/files-section';
import { FilesSetupInstructions } from '@/components/sections/files-setup-instructions';
import { Button } from '@/components/ui/button';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
];

export default function FilesPage() {
  const filesSectionRef = useRef<{ refresh: () => void }>(null);
  const isFilesBrowserAvailable = useAtomValue(isFilesBrowserAvailableAtom);

  return (
    <>
      <PageHeader
        breadcrumbs={breadcrumbs}
        currentPage="Files"
        actions={
          isFilesBrowserAvailable ? (
            <Button onClick={() => filesSectionRef.current?.refresh()}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          ) : null
        }
      />
      <div className="flex flex-1 flex-col">
        {isFilesBrowserAvailable ? (
          <FilesSection ref={filesSectionRef} />
        ) : (
          <FilesSetupInstructions />
        )}
      </div>
    </>
  );
}
