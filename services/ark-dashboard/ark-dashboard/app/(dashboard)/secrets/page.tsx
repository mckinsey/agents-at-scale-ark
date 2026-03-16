'use client';

import { Plus } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useRef } from 'react';

import { PageHeader } from '@/components/common/page-header';
import { SecretsSection } from '@/components/sections/secrets-section';
import { Button } from '@/components/ui/button';
import { BASE_BREADCRUMBS } from '@/lib/constants/breadcrumbs';
import { useNamespace } from '@/providers/NamespaceProvider';

export default function SecretsPage() {
  const searchParams = useSearchParams();
  const namespace = searchParams.get('namespace') || 'default';
  const secretsSectionRef = useRef<{ openAddEditor: () => void }>(null);
  const { readOnlyMode } = useNamespace();

  return (
    <>
      <PageHeader
        breadcrumbs={BASE_BREADCRUMBS}
        currentPage="Secrets"
        actions={
          <Button
            onClick={() => secretsSectionRef.current?.openAddEditor()}
            disabled={readOnlyMode}>
            <Plus className="h-4 w-4" />
            Add Secret
          </Button>
        }
      />
      <div className="flex flex-1 flex-col">
        <div className="px-6 pt-6">
          <h1 className="text-3xl font-bold">Secrets</h1>
        </div>
        <SecretsSection ref={secretsSectionRef} namespace={namespace} />
      </div>
    </>
  );
}
