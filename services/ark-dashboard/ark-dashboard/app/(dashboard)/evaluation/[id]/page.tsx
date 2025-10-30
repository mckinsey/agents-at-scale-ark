'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { EvaluationDetailView } from '@/components/evaluation';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
  { href: '/evaluations', label: 'Evaluations' },
];

function EvaluationDetailContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const evaluationId = params.id as string;
  const namespace = searchParams.get('namespace') || 'default';
  const enhanced = searchParams.get('enhanced') === 'true';

  return (
    <>
      <PageHeader breadcrumbs={breadcrumbs} currentPage={evaluationId} />
      <div className="flex flex-1 flex-col gap-4 p-4">
        <EvaluationDetailView
          evaluationId={evaluationId}
          namespace={namespace}
          enhanced={enhanced}
        />
      </div>
    </>
  );
}

export default function EvaluationDetailPage() {
  return (
    <Suspense>
      <EvaluationDetailContent />
    </Suspense>
  );
}
