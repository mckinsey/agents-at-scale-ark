'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { EvaluatorEditForm } from '@/components/forms/evaluator-edit-form';
import {
  type EvaluatorDetailResponse,
  evaluatorsService,
} from '@/lib/services';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
  { href: '/evaluators', label: 'Evaluators' },
];

interface EvaluatorEditContentProps {
  namespace: string;
  evaluatorName: string;
}

function EvaluatorEditContent({
  namespace,
  evaluatorName,
}: EvaluatorEditContentProps) {
  const router = useRouter();
  const [evaluator, setEvaluator] = useState<EvaluatorDetailResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadEvaluator = async () => {
      try {
        const data = await evaluatorsService.getDetailsByName(evaluatorName);
        setEvaluator(data);
      } catch (error) {
        toast.error('Failed to Load Evaluator', {
          description:
            error instanceof Error
              ? error.message
              : 'An unexpected error occurred',
        });
        router.push(`/evaluators`);
      } finally {
        setLoading(false);
      }
    };

    loadEvaluator();
  }, [namespace, evaluatorName, router]);

  const handleSave = async (data: Record<string, unknown>) => {
    setSaving(true);
    try {
      await evaluatorsService.update(evaluatorName, data);
      toast.success('Evaluator Updated', {
        description: 'Successfully updated the evaluator',
      });
      router.push(`/evaluators`);
    } catch (error) {
      toast.error('Failed to Update Evaluator', {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    router.push(`/evaluators`);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="py-8 text-center">Loading evaluator...</div>
      </div>
    );
  }

  if (!evaluator) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="py-8 text-center">Evaluator not found</div>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        breadcrumbs={breadcrumbs}
        currentPage={`Edit ${evaluator.name}`}
      />
      <div className="flex-1 overflow-hidden">
        <EvaluatorEditForm
          evaluator={evaluator}
          namespace={namespace}
          onSave={handleSave}
          onCancel={handleCancel}
          saving={saving}
        />
      </div>
    </>
  );
}

function EvaluatorEditPageContent() {
  const searchParams = useSearchParams();
  const params = useParams();
  const namespace = searchParams.get('namespace') || 'default';
  const evaluatorName = params.name as string;

  return (
    <EvaluatorEditContent namespace={namespace} evaluatorName={evaluatorName} />
  );
}

export default function EvaluatorEditPage() {
  return (
    <Suspense>
      <EvaluatorEditPageContent />
    </Suspense>
  );
}
