'use client';

import { RefreshCw } from 'lucide-react';
import { useRef } from 'react';

import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { FilesSection } from '@/components/sections/files-section';
import { Button } from '@/components/ui/button';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
];

export default function FilesPage() {
  const filesSectionRef = useRef<{ refresh: () => void }>(null);

  return (
    <>
      <PageHeader
        breadcrumbs={breadcrumbs}
        currentPage="Files"
        actions={
          <Button onClick={() => filesSectionRef.current?.refresh()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />
      <div className="flex flex-1 flex-col">
        <FilesSection ref={filesSectionRef} />
      </div>
    </>
  );
}
