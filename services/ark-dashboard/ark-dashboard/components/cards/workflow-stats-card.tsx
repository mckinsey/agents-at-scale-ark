'use client';

import {
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Clock,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { WorkflowStats } from '@/lib/services/workflow-templates';

interface Props {
  templateName: string;
  stats: WorkflowStats | null;
  isLoading: boolean;
}

interface StatLinkProps {
  href: string;
  icon: LucideIcon;
  label: string;
  value: number;
  colorClass?: string;
}

function getSessionsUrl(templateName: string, status?: string) {
  const params = new URLSearchParams({
    workflowTemplateName: templateName,
  });
  if (status) {
    params.set('status', status);
  }
  return `/sessions?${params}`;
}

function StatLink({
  href,
  icon: Icon,
  label,
  value,
  colorClass = 'text-muted-foreground',
}: StatLinkProps) {
  return (
    <Link
      href={href}
      className="group flex flex-col items-center space-y-1 transition-all">
      <div className={`flex items-center gap-1.5 text-xs ${colorClass}`}>
        <Icon className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="flex items-center gap-0.5">
          {label}
          <ArrowUpRight className="h-2.5 w-2.5 opacity-40" />
        </span>
      </div>
      <div className={`text-2xl font-bold ${colorClass}`}>{value}</div>
    </Link>
  );
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
            <StatLink
              href={getSessionsUrl(templateName)}
              icon={BarChart3}
              label="Total"
              value={stats.total}
            />
            <StatLink
              href={getSessionsUrl(templateName, 'succeeded')}
              icon={CheckCircle2}
              label="Succeeded"
              value={stats.succeeded}
              colorClass="text-green-700 dark:text-green-500"
            />
            <StatLink
              href={getSessionsUrl(templateName, 'running')}
              icon={Clock}
              label="Running"
              value={stats.running}
              colorClass="text-blue-600 dark:text-blue-400"
            />
            <StatLink
              href={getSessionsUrl(templateName, 'failed')}
              icon={XCircle}
              label="Failed"
              value={stats.failed}
              colorClass="text-red-600 dark:text-red-500"
            />
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No data available</p>
        )}
      </CardContent>
    </Card>
  );
}
