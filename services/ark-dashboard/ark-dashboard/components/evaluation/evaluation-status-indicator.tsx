'use client';

import {
  AlertTriangle,
  BarChart3,
  CheckCircle,
  Clock,
  ExternalLink,
  XCircle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  type QueryEvaluationSummary,
  evaluationsService,
} from '@/lib/services';

interface EvaluationStatusIndicatorProps {
  queryName: string;
  compact?: boolean;
  enhanced?: boolean;
}

const getStatusConfig = (status: QueryEvaluationSummary['status']) => {
  switch (status) {
    case 'all-passed':
      return {
        color:
          'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
        icon: CheckCircle,
        label: 'All Passed',
        description: 'All evaluations passed',
      };
    case 'all-failed':
      return {
        color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
        icon: XCircle,
        label: 'All Failed',
        description: 'All evaluations failed',
      };
    case 'mixed':
      return {
        color:
          'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
        icon: AlertTriangle,
        label: 'Mixed Results',
        description: 'Some passed, some failed',
      };
    case 'pending':
      return {
        color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
        icon: Clock,
        label: 'In Progress',
        description: 'Evaluations running or pending',
      };
    default:
      return {
        color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
        icon: BarChart3,
        label: 'No Evaluations',
        description: 'No evaluations found',
      };
  }
};

export function EvaluationStatusIndicator({
  queryName,
  compact = false,
  enhanced = false,
}: EvaluationStatusIndicatorProps) {
  const [summary, setSummary] = useState<QueryEvaluationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const loadSummary = useCallback(async () => {
    try {
      const data = await evaluationsService.getEvaluationSummary(
        queryName,
        enhanced,
      );
      setSummary(data);
      setError(null);
    } catch (err) {
      console.error(
        `Failed to load evaluation summary for query ${queryName}:`,
        err,
      );
      setError('Failed to load evaluation status');
      setSummary(null);
    }
  }, [queryName, enhanced]);

  useEffect(() => {
    const initialLoad = async () => {
      setLoading(true);
      await loadSummary();
      setLoading(false);
    };

    initialLoad();
  }, [loadSummary]);

  const handleViewEvaluations = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Navigate to evaluations page with query filter
    const enhancedParam = enhanced ? '&enhanced=true' : '';
    router.push(
      `/evaluations?query=${encodeURIComponent(queryName)}${enhancedParam}`,
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-1">
        <div className="h-4 w-4 animate-pulse rounded-full bg-gray-200" />
        {!compact && (
          <span className="text-muted-foreground text-xs">Loading...</span>
        )}
      </div>
    );
  }

  if (error) {
    if (compact) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <div className="flex items-center justify-center gap-1">
                <AlertTriangle className="h-3 w-3 text-red-600" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{error}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    return (
      <div className="flex items-center gap-2 text-xs text-red-600">
        <AlertTriangle className="h-3 w-3" />
        <span>{error}</span>
      </div>
    );
  }

  if (!summary || summary.total === 0) {
    const config = getStatusConfig('none');

    if (compact) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <div className="flex items-center justify-center gap-1">
                <AlertTriangle className="h-3 w-3 text-yellow-600" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>No evaluations configured for this query</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    const Icon = config.icon;

    return (
      <Badge variant="secondary" className="text-xs">
        <Icon className="mr-1 h-3 w-3" />
        No Evaluations
      </Badge>
    );
  }

  const config = getStatusConfig(summary.status);
  const Icon = config.icon;

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="flex h-auto items-center justify-center gap-1 p-1"
              onClick={handleViewEvaluations}>
              <Icon
                className={`h-3 w-3 ${
                  summary.status === 'all-passed'
                    ? 'text-green-600'
                    : summary.status === 'all-failed'
                      ? 'text-red-600'
                      : summary.status === 'mixed'
                        ? 'text-yellow-600'
                        : summary.status === 'pending'
                          ? 'text-blue-600'
                          : 'text-gray-400'
                }`}
              />
              <span className="text-xs font-medium">{summary.total}</span>
              <ExternalLink className="h-2 w-2 opacity-50" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-xs">
              <p className="font-medium">{config.label}</p>
              <p>Total: {summary.total}</p>
              {summary.passed > 0 && (
                <p className="text-green-600">Passed: {summary.passed}</p>
              )}
              {summary.failed > 0 && (
                <p className="text-red-600">Failed: {summary.failed}</p>
              )}
              {summary.pending > 0 && (
                <p className="text-blue-600">Pending: {summary.pending}</p>
              )}
              <p className="mt-1 opacity-75">Click to view evaluations</p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Badge className={config.color}>
        <Icon className="mr-1 h-3 w-3" />
        {config.label}
      </Badge>
      <div className="text-muted-foreground flex items-center gap-1 text-xs">
        <span>{summary.total} total</span>
        {summary.passed > 0 && (
          <span className="text-green-600">• {summary.passed} passed</span>
        )}
        {summary.failed > 0 && (
          <span className="text-red-600">• {summary.failed} failed</span>
        )}
        {summary.pending > 0 && (
          <span className="text-blue-600">• {summary.pending} pending</span>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleViewEvaluations}
        className="h-6 px-2 text-xs">
        View
        <ExternalLink className="ml-1 h-3 w-3" />
      </Button>
    </div>
  );
}
