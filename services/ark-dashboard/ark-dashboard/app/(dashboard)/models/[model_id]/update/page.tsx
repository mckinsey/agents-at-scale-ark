'use client';

import { use } from 'react';

import { PageHeader } from '@/components/common/page-header';
import { UpdateModelForm } from '@/components/forms';
import { Spinner } from '@/components/ui/spinner';
import { useGetModelbyId } from '@/lib/services/models-hooks';

type PageProps = {
  params: Promise<{ model_id: string }>;
};

export default function ModelUpdatePage({ params }: PageProps) {
  const { model_id: modelId } = use(params);
  const { data, isPending } = useGetModelbyId({ modelId });

  return (
    <div className="flex min-h-screen flex-col">
      <PageHeader />
      {isPending && (
        <div className="flex w-full flex-1 items-center justify-center">
          <Spinner />
        </div>
      )}
      <main className="container px-6 py-8">
        {data && <UpdateModelForm model={data} />}
      </main>
    </div>
  );
}
