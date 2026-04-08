'use client';

import { use } from 'react';
import { useSearchParams } from 'next/navigation';

import {
  type BreadcrumbElement,
  PageHeader,
} from '@/components/common/page-header';
import { UpdateModelForm } from '@/components/forms';
import { Spinner } from '@/components/ui/spinner';
import { BASE_BREADCRUMBS } from '@/lib/constants/breadcrumbs';
import { useGetModelbyId } from '@/lib/services/models-hooks';

type PageProps = {
  params: Promise<{ model_id: string }>;
};

export default function ModelUpdatePage({ params }: PageProps) {
  const { model_id: modelId } = use(params);
  const { data, isPending } = useGetModelbyId({ modelId });

  const breadcrumbs: BreadcrumbElement[] = [
    ...BASE_BREADCRUMBS,
    { label: 'Models', href: '/models' },
  ];

  const currentPage = data?.name || 'Update Model';

  return (
    <div className="flex min-h-screen flex-col">
      <PageHeader breadcrumbs={breadcrumbs} currentPage={currentPage} />
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
