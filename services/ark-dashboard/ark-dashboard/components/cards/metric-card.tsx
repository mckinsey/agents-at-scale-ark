"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { ComponentProps } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";


function LoadingState() {
  return (
    <div className="flex flex-col space-y-2 w-full">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  )
}

export type Props = {
  title: string;
  value: number | string;
  Icon: LucideIcon;
  href: ComponentProps<typeof Link>["href"];
  isLoading: boolean;
  hasError: boolean;
};

export function MetricCard({
  title,
  value,
  Icon,
  href,
  isLoading,
  hasError
}: Props) {

  return (
    <Link href={href}>
      <Card
        className={cn(
          "group cursor-pointer transition-all duration-200 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10",
          hasError && "border-destructive/50 bg-destructive/5"
        )}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle
            className={cn(
              "text-sm font-medium text-foreground group-hover:text-primary transition-colors",
              hasError && "text-destructive"
            )}
          >
            {title}
          </CardTitle>
          <div
            className={cn(
              "text-foreground group-hover:text-primary transition-colors",
              hasError && "text-destructive"
            )}
          >
            {hasError ? (
              <AlertTriangle className="h-4 w-4" />
            ) : (
              <Icon className="h-4 w-4" />
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between min-h-14">
            {hasError ? (
              <div className="flex flex-col space-y-2">
                <div className="text-2xl font-bold text-destructive">!</div>
                <p className="text-xs text-destructive">Failed to fetch data</p>
              </div>
            ) : isLoading ? (<LoadingState />) : !value ? (
              <div className="flex flex-col space-y-2">
                <div className="text-2xl font-bold text-muted-foreground">
                  —
                </div>
                <p className="text-xs text-muted-foreground">
                  No data available
                </p>
              </div>
            ) : (
              <div className="self-start text-2xl font-bold">{value}</div>
            )}
            <ChevronRight
              className={cn(
                "h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors",
                hasError && "text-destructive"
              )}
            />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
