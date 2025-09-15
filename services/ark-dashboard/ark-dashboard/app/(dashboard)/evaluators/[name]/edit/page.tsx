"use client";

import { EvaluatorEditForm } from "@/components/forms/evaluator-edit-form";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from "@/components/ui/breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { toast } from "@/components/ui/use-toast";
import {
  evaluatorsService,
  type EvaluatorDetailResponse
} from "@/lib/services";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

interface EvaluatorEditContentProps {
  namespace: string;
  evaluatorName: string;
}

function EvaluatorEditContent({
  namespace,
  evaluatorName
}: EvaluatorEditContentProps) {
  const router = useRouter();
  const [evaluator, setEvaluator] = useState<EvaluatorDetailResponse | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadEvaluator = async () => {
      try {
        const data = await evaluatorsService.getDetailsByName(
          namespace,
          evaluatorName
        );
        setEvaluator(data);
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Failed to Load Evaluator",
          description:
            error instanceof Error
              ? error.message
              : "An unexpected error occurred"
        });
        router.push(`/evaluators?namespace=${namespace}`);
      } finally {
        setLoading(false);
      }
    };

    loadEvaluator();
  }, [namespace, evaluatorName, router]);

  const handleSave = async (data: Record<string, unknown>) => {
    setSaving(true);
    try {
      await evaluatorsService.update(namespace, evaluatorName, data);
      toast({
        variant: "success",
        title: "Evaluator Updated",
        description: "Successfully updated the evaluator"
      });
      router.push(`/evaluators?namespace=${namespace}`);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to Update Evaluator",
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    router.push(`/evaluators?namespace=${namespace}`);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center py-8">Loading evaluator...</div>
      </div>
    );
  }

  if (!evaluator) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center py-8">Evaluator not found</div>
      </div>
    );
  }

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href="/">ARK Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbLink href={`/evaluators?namespace=${namespace}`}>
                Evaluators
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Edit {evaluator.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

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
  const namespace = searchParams.get("namespace") || "default";
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
