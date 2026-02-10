'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { PageHeader } from '@/components/common/page-header';
import { ModelsSection } from '@/components/sections/models-section';
import { Button } from '@/components/ui/button';
import { useNamespace } from '@/providers/NamespaceProvider';
import { useGetAllModels } from '@/lib/services/models-hooks';

export default function ModelsPage() {
  const searchParams = useSearchParams();
  const namespace = searchParams.get('namespace') || 'default';
  const { readOnlyMode } = useNamespace();
  const { data: models } = useGetAllModels();

  const pageTitle = models ? `Models (${models.length})` : 'Models';

  return (
    <>
      <PageHeader
        actions={
          readOnlyMode ? (
            <Button disabled>
              <Plus className="h-4 w-4" />
              Add Model
            </Button>
          ) : (
            <Link href="/models/new">
              <Button>
                <Plus className="h-4 w-4" />
                Add Model
              </Button>
            </Link>
          )
        }
      />
      <div className="flex flex-1 flex-col">
        <div className="px-6 pt-6">
          <h1 className="text-xl">{pageTitle}</h1>
        </div>
        <ModelsSection namespace={namespace} />
      </div>
    </>
  );
}
