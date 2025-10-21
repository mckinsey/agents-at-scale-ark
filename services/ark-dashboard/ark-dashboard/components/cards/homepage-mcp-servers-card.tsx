"use client";

import { MetricCard } from "./metric-card";
import { DASHBOARD_SECTIONS } from "@/lib/constants";
import { useGetAllMcpServers } from "@/lib/services/mcp-servers-hooks";
import { toast } from "sonner";
import { useEffect } from "react";

export function HomepageMcpServersCard() {
  const { data, isPending, error } = useGetAllMcpServers();

  const count = data?.length || 0;

  const section = DASHBOARD_SECTIONS.mcp;
  const href = `/${section.key}`;

  useEffect(() => {
    if (error) {
      toast.error("Failed to get MCP Servers", {
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
