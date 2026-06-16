'use client';

import { Plus } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

import { NamespacedLink } from '@/components/namespaced-link';
import { PageHeader } from '@/components/common/page-header';
import { ModelsSection } from '@/components/sections/models-section';
import { Button } from '@/components/ui/button';
import { BASE_BREADCRUMBS } from '@/lib/constants/breadcrumbs';
import { useGetAllModels } from '@/lib/services/models-hooks';
import { useNamespace } from '@/providers/NamespaceProvider';

export default function ModelsPage() {
  const searchParams = useSearchParams();
  const namespace = searchParams.get('namespace') || 'default';
  const { readOnlyMode } = useNamespace();
  const { data: models } = useGetAllModels();

  const pageTitle = models ? `Models (${models.length})` : 'Models';

  return (
    <>
      <PageHeader
        breadcrumbs={BASE_BREADCRUMBS}
        currentPage="Models"
        actions={
          readOnlyMode ? (
            <Button disabled>
              <Plus className="h-4 w-4" />
              Add Model
            </Button>
          ) : (
            <NamespacedLink href="/models/new">
              <Button>
                <Plus className="h-4 w-4" />
                Add Model
              </Button>
            </NamespacedLink>
          )
        }
      />
      <div className="flex flex-1 flex-col">
        <div>
          <h1 className="text-xl">{pageTitle}</h1>
        </div>
        <ModelsSection namespace={namespace} />
      </div>
    </>
  );
}
