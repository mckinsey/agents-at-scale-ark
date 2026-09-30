'use client';

import { Memory } from '@/components/icons';
import { ModelsTable } from '@/components/sections/models-table';
import { ResourceListSection } from '@/components/sections/resource-list-section';
import { DOCS_URLS } from '@/lib/constants/docs';
import { useDeleteModel, useGetAllModels } from '@/lib/services/models-hooks';

export function ModelsSection() {
  const { data: models = [], isPending, error, refetch } = useGetAllModels();
  const deleteModel = useDeleteModel();

  return (
    <ResourceListSection
      icon={<Memory />}
      title="Models"
      subtitle="Add and manage all your models"
      createHref="/models/new"
      createLabel="Add model"
      learnMoreUrl={DOCS_URLS.models}
      entityLabel="Model"
      entityPluralLabel="models"
      emptyTitle="No models yet"
      emptyDescription={
        <>
          <p className="mb-2">You haven&apos;t added any models yet.</p>
          <p>Get started by adding your first model.</p>
        </>
      }
      items={models}
      loading={isPending}
      error={error}
      onDelete={id => deleteModel.mutate(id)}
      onReload={() => refetch()}
      renderTable={(items, onDelete) => (
        <ModelsTable models={items} onDelete={onDelete} />
      )}
    />
  );
}
