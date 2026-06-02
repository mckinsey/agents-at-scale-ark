'use client';

import { use } from 'react';

import { UpdateModelForm } from '@/components/forms';
import { Spinner } from '@/components/ui/spinner';
import { useGetModelbyId } from '@/lib/services/models-hooks';

type PageProps = {
  params: Promise<{ model_id: string }>;
};

export default function ModelUpdatePage({ params }: PageProps) {
  const { model_id: modelId } = use(params);
  const { data, isPending } = useGetModelbyId({ modelId });

  if (isPending) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return data ? <UpdateModelForm model={data} /> : null;
}
