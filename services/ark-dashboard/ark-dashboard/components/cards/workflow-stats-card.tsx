'use client';

import {
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Clock,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { WorkflowStats } from '@/lib/services/workflow-templates';

interface Props {
  templateName: string;
  stats: WorkflowStats | null;
  isLoading: boolean;
}

function LoadingState() {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex flex-col space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-12" />
        </div>
      ))}
    </div>
  );
}

export function WorkflowStatsCard({ templateName, stats, isLoading }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          Last 24 Hours Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingState />
        ) : stats ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Link
              href={`/sessions?template=${encodeURIComponent(templateName)}`}
              className="group flex flex-col items-center space-y-1 transition-all">
              <div className="text-muted-foreground flex items-start gap-1.5 text-xs">
                <BarChart3 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span className="flex items-start gap-0.5">
                  Total
                  <ArrowUpRight className="h-2.5 w-2.5 opacity-40" />
                </span>
              </div>
              <div className="text-2xl font-bold">{stats.total}</div>
            </Link>
            <Link
              href={`/sessions?template=${encodeURIComponent(templateName)}&status=succeeded`}
              className="group flex flex-col items-center space-y-1 transition-all">
              <div className="flex items-start gap-1.5 text-xs text-green-700 dark:text-green-500">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span className="flex items-start gap-0.5">
                  Succeeded
                  <ArrowUpRight className="h-2.5 w-2.5 opacity-40" />
                </span>
              </div>
              <div className="text-2xl font-bold text-green-700 dark:text-green-500">
                {stats.succeeded}
              </div>
            </Link>
            <Link
              href={`/sessions?template=${encodeURIComponent(templateName)}&status=running`}
              className="group flex flex-col items-center space-y-1 transition-all">
              <div className="flex items-start gap-1.5 text-xs text-blue-600 dark:text-blue-400">
                <Clock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span className="flex items-start gap-0.5">
                  Running
                  <ArrowUpRight className="h-2.5 w-2.5 opacity-40" />
                </span>
              </div>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {stats.running}
              </div>
            </Link>
            <Link
              href={`/sessions?template=${encodeURIComponent(templateName)}&status=failed`}
              className="group flex flex-col items-center space-y-1 transition-all">
              <div className="flex items-start gap-1.5 text-xs text-red-600 dark:text-red-500">
                <XCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span className="flex items-start gap-0.5">
                  Failed
                  <ArrowUpRight className="h-2.5 w-2.5 opacity-40" />
                </span>
              </div>
              <div className="text-2xl font-bold text-red-600 dark:text-red-500">
                {stats.failed}
              </div>
            </Link>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No data available</p>
        )}
      </CardContent>
    </Card>
  );
}
