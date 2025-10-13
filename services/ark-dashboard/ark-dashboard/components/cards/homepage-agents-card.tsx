"use client";

import { MetricCard } from "./metric-card";
import { DASHBOARD_SECTIONS } from "@/lib/constants";
import { useGetAllAgents } from "@/lib/services/agents-hooks";
import { useEffect } from "react";
import { toast } from "@/components/ui/use-toast";

export function HomepageAgentsCard() {
  const { data, isPending, error } = useGetAllAgents();

  const count = data?.length || 0;

  const section = DASHBOARD_SECTIONS.agents;
  const href = `/${section.key}`;

  useEffect(() => {
    if (error) {
      toast({
        variant: "destructive",
        title: `Failed to get Agents`,
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
      href={href}
      isLoading={isPending}
      hasError={Boolean(error)}
    />
  );
}
