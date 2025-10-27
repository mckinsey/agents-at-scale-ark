'use client';

import { Plus } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useRef } from 'react';

import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { SecretsSection } from '@/components/sections/secrets-section';
import { Button } from '@/components/ui/button';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
];

export default function SecretsPage() {
  const searchParams = useSearchParams();
  const namespace = searchParams.get('namespace') || 'default';
  const secretsSectionRef = useRef<{ openAddEditor: () => void }>(null);

  return (
    <>
      <PageHeader
        breadcrumbs={breadcrumbs}
        currentPage="Secrets"
        actions={
          <Button onClick={() => secretsSectionRef.current?.openAddEditor()}>
            <Plus className="h-4 w-4" />
            Add Secret
          </Button>
        }
      />
      <div className="flex flex-1 flex-col">
        <SecretsSection ref={secretsSectionRef} namespace={namespace} />
      </div>
    </>
  );
}
