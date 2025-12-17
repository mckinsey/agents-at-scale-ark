'use client';

import {
  AlertTriangle,
  BarChart3,
  CheckCircle,
  ChevronDown,
  Clock,
  ExternalLink,
  Plus,
  XCircle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { EvaluationEditor } from '@/components/editors';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { components } from '@/lib/api/generated/types';
import {
  type Evaluator,
  type QueryEvaluationSummary,
  evaluationsService,
  evaluatorsService,
} from '@/lib/services';

type EvaluationCreateRequest = components['schemas']['EvaluationCreateRequest'];
type EvaluationUpdateRequest = components['schemas']['EvaluationUpdateRequest'];

interface QueryEvaluationActionsProps {
  queryName: string;
}

const getStatusConfig = (status: QueryEvaluationSummary['status']) => {
  switch (status) {
    case 'all-passed':
      return {
        icon: CheckCircle,
        color: 'text-green-600',
        label: 'All Passed',
      };
    case 'all-failed':
      return { icon: XCircle, color: 'text-red-600', label: 'All Failed' };
    case 'mixed':
      return {
        icon: AlertTriangle,
        color: 'text-yellow-600',
        label: 'Mixed Results',
      };
    case 'pending':
      return { icon: Clock, color: 'text-blue-600', label: 'In Progress' };
    default:
      return {
        icon: BarChart3,
        color: 'text-gray-400',
        label: 'No Evaluations',
      };
  }
};

export function QueryEvaluationActions({
  queryName,
}: QueryEvaluationActionsProps) {
  const [summary, setSummary] = useState<QueryEvaluationSummary | null>(null);
  const [evaluators, setEvaluators] = useState<Evaluator[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedEvaluator, setSelectedEvaluator] = useState<string>('');
  const router = useRouter();

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [summaryData, evaluatorsData] = await Promise.all([
          evaluationsService.getEvaluationSummary(queryName),
          evaluatorsService.getAll(),
        ]);
        setSummary(summaryData);
        setEvaluators(evaluatorsData);
      } catch {
        // Silently fail - UI will show loading state or empty state
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [queryName]);

  const handleViewEvaluations = () => {
    router.push(`/evaluations?query=${encodeURIComponent(queryName)}`);
  };

  const handleCreateEvaluation = (evaluatorName?: string) => {
    if (evaluatorName) {
      setSelectedEvaluator(evaluatorName);
    }
    setEditorOpen(true);
  };

  const handleSaveEvaluation = async (
    evaluationData: (EvaluationCreateRequest | EvaluationUpdateRequest) & {
      id?: string;
    },
  ) => {
    try {
      // Create the evaluation
      const createRequest = evaluationData as EvaluationCreateRequest;
      await evaluationsService.create(createRequest);

      // Refresh the summary after save
      const newSummary =
        await evaluationsService.getEvaluationSummary(queryName);
      setSummary(newSummary);
    } catch (error) {
      throw error; // Re-throw so EvaluationEditor can handle the error display
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 animate-pulse rounded-full bg-gray-200" />
        <span className="text-muted-foreground text-sm">Loading...</span>
      </div>
    );
  }

  const statusConfig = getStatusConfig(summary?.status || 'none');
  const StatusIcon = statusConfig.icon;

  return (
    <div className="flex items-center gap-2">
      {/* Evaluation Summary Badge */}
      {summary && summary.total > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleViewEvaluations}
                className="h-8 gap-2 px-3">
                <StatusIcon className={`h-4 w-4 ${statusConfig.color}`} />
                <span className="text-sm font-medium">{summary.total}</span>
                <Badge variant="secondary" className="text-xs">
                  {summary.passed}✓ {summary.failed}✗
                </Badge>
                <ExternalLink className="h-3 w-3 opacity-60" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-xs">
                <p className="font-medium">{statusConfig.label}</p>
                <p>Total: {summary.total} evaluations</p>
                {summary.passed > 0 && (
                  <p className="text-green-600">✓ Passed: {summary.passed}</p>
                )}
                {summary.failed > 0 && (
                  <p className="text-red-600">✗ Failed: {summary.failed}</p>
                )}
                {summary.pending > 0 && (
                  <p className="text-blue-600">⏳ Pending: {summary.pending}</p>
                )}
                <p className="mt-1 opacity-75">Click to view all evaluations</p>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* View Evaluations Button (when no evaluations exist) */}
      {(!summary || summary.total === 0) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleViewEvaluations}
          className="text-muted-foreground h-8 gap-2 px-3">
          <BarChart3 className="h-4 w-4" />
          <span className="text-sm">No Evaluations</span>
          <ExternalLink className="h-3 w-3 opacity-60" />
        </Button>
      )}

      {/* Create Evaluation Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1">
            <Plus className="h-4 w-4" />
            New Evaluation
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => handleCreateEvaluation()}>
            <Plus className="mr-2 h-4 w-4" />
            Create Custom Evaluation
          </DropdownMenuItem>

          {evaluators.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <div className="text-muted-foreground px-2 py-1 text-xs font-medium">
                Quick Start with Evaluator:
              </div>
              {evaluators.slice(0, 5).map(evaluator => (
                <DropdownMenuItem
                  key={evaluator.name}
                  onClick={() => handleCreateEvaluation(evaluator.name)}
                  className="text-xs">
                  <BarChart3 className="mr-2 h-3 w-3" />
                  {evaluator.name}
                </DropdownMenuItem>
              ))}
              {evaluators.length > 5 && (
                <DropdownMenuItem onClick={() => handleCreateEvaluation()}>
                  <Plus className="mr-2 h-3 w-3" />
                  More evaluators...
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Evaluation Editor */}
      <EvaluationEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        evaluation={null}
        onSave={handleSaveEvaluation}
        initialEvaluator={selectedEvaluator}
        initialQueryRef={queryName}
      />
    </div>
  );
}
