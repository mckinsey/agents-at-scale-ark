"use client";

import { useGetAllModels } from "@/lib/services/models-hooks";
import { MetricCard } from "./metric-card";
import { DASHBOARD_SECTIONS } from "@/lib/constants";
import { useEffect } from "react";
import { toast } from "@/components/ui/use-toast";

export function HomepageModelsCard() {
  const { data, isPending, error } = useGetAllModels();

  const count = data?.length || 0;
  const section = DASHBOARD_SECTIONS.models;

  useEffect(() => {
    if (error) {
      toast({
        variant: "destructive",
        title: `Failed to get Models`,
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred"
      });
    }
  }, [error]);

  return (
    <MetricCard
      key={section.key}
      title={section.title}
      value={count}
      Icon={section.icon}
      href={`/${section.key}`}
      isLoading={isPending}
      hasError={Boolean(error)}
    />
  );
}
