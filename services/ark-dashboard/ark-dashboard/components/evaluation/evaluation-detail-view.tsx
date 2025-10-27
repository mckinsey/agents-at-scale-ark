'use client';

import {
  AlertCircle,
  BarChart3,
  CheckCircle,
  Clock,
  FileText,
  Play,
  Settings,
  Sparkles,
  Square,
  TrendingUp,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { components } from '@/lib/api/generated/types';
import { useDelayedLoading } from '@/lib/hooks/use-delayed-loading';
import { evaluationsService } from '@/lib/services/evaluations';

import { EnhancedEvaluationDetailView } from './enhanced-evaluation-detail-view';
import { EventMetricsDisplay } from './event-metrics-display';
import { MetricsEvaluationDisplay } from './metrics-evaluation-display';
import { QualityEvaluationDisplay } from './quality-evaluation-display';

type EvaluationDetailResponse =
  components['schemas']['EvaluationDetailResponse'];

interface EvaluationDetailViewProps {
  evaluationId: string;
  namespace: string;
  enhanced?: boolean;
}

interface StatusBadgeProps {
  status: string;
  onCancel?: () => void;
}

const StatusBadge = ({ status, onCancel }: StatusBadgeProps) => {
  const getStatusInfo = () => {
    switch (status) {
      case 'done':
        return {
          color:
            'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
          icon: CheckCircle,
          label: 'Completed',
        };
      case 'error':
        return {
          color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
          icon: AlertCircle,
          label: 'Error',
        };
      case 'running':
        return {
          color:
            'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
          icon: Play,
          label: 'Running',
        };
      case 'canceled':
        return {
          color:
            'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
          icon: Square,
          label: 'Canceled',
        };
      default:
        return {
          color:
            'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
          icon: Clock,
          label: 'Unknown',
        };
    }
  };

  const { color, icon: Icon, label } = getStatusInfo();
  const canCancel = status === 'running';

  return (
    <div className="flex items-center gap-2">
      <Badge className={color}>
        <Icon className="mr-1 h-3 w-3" />
        {label}
      </Badge>
      {canCancel && onCancel && (
        <Button variant="outline" size="sm" onClick={onCancel}>
          <Square className="mr-1 h-3 w-3" />
          Cancel
        </Button>
      )}
    </div>
  );
};

export function EvaluationDetailView({
  evaluationId,
  namespace,
  enhanced = false,
}: EvaluationDetailViewProps) {
  const [evaluation, setEvaluation] = useState<EvaluationDetailResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);
  const [useEnhanced, setUseEnhanced] = useState(enhanced);
  const [enhancedAvailable, setEnhancedAvailable] = useState(false);
  const showLoading = useDelayedLoading(loading);

  const loadEvaluation = useCallback(async () => {
    try {
      const data = await evaluationsService.getDetailsByName(evaluationId);
      setEvaluation(data);

      // Check if enhanced data is available by trying to fetch it
      try {
        const enhancedData =
          await evaluationsService.getEnhancedDetailsByName(evaluationId);
        if (enhancedData?.enhanced_metadata) {
          setEnhancedAvailable(true);
        }
      } catch {
        // Enhanced data not available, continue with basic view
        setEnhancedAvailable(false);
      }
    } catch (error) {
      toast.error('Failed to Load Evaluation', {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    }
  }, [evaluationId]);

  useEffect(() => {
    const initialLoad = async () => {
      setLoading(true);
      await loadEvaluation();
      setLoading(false);
    };

    initialLoad();
  }, [loadEvaluation]);

  // Auto-refresh for running evaluation
  useEffect(() => {
    if (!evaluation) return;

    const status = (evaluation.status as Record<string, unknown>)
      ?.phase as string;
    const isRunning = status === 'running';

    if (!isRunning) return;

    const intervalId = setInterval(() => {
      loadEvaluation();
    }, 5000); // Poll every 5 seconds when evaluation is running

    return () => clearInterval(intervalId);
  }, [evaluation, loadEvaluation]);

  const handleCancel = async () => {
    if (!evaluation) return;

    setCanceling(true);
    try {
      await evaluationsService.cancel(evaluation.name);
      toast.success('Evaluation Canceled', {
        description: 'Successfully canceled the evaluation',
      });

      // Reload evaluation data
      await loadEvaluation();
    } catch (error) {
      toast.error('Failed to Cancel Evaluation', {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    } finally {
      setCanceling(false);
    }
  };

  // If enhanced mode is requested, use the enhanced component
  if (useEnhanced) {
    return (
      <EnhancedEvaluationDetailView
        evaluationId={evaluationId}
        namespace={namespace}
      />
    );
  }

  if (showLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">
          Loading evaluation details...
        </div>
      </div>
    );
  }

  if (!evaluation) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <AlertCircle className="text-muted-foreground mx-auto h-12 w-12" />
          <h3 className="text-foreground mt-2 text-sm font-semibold">
            Evaluation not found
          </h3>
          <p className="text-muted-foreground mt-1 text-sm">
            The evaluation &quot;{evaluationId}&quot; could not be found.
          </p>
        </div>
      </div>
    );
  }

  const spec = evaluation.spec as Record<string, unknown>;
  const status = evaluation.status as Record<string, unknown>;
  const evaluationMetadata = evaluation.metadata as Record<string, unknown>;
  const annotations =
    (evaluationMetadata?.annotations as Record<string, unknown>) || {};

  // Extract evaluation metadata from annotations
  const metadata: Record<string, unknown> = {};
  Object.entries(annotations).forEach(([key, value]) => {
    if (key.startsWith('evaluation.metadata/')) {
      const metadataKey = key.replace('evaluation.metadata/', '');
      // Parse JSON strings if needed
      if (
        typeof value === 'string' &&
        (value.startsWith('[') || value.startsWith('{'))
      ) {
        try {
          metadata[metadataKey] = JSON.parse(value);
        } catch {
          metadata[metadataKey] = value;
        }
      } else {
        metadata[metadataKey] = value;
      }
    }
  });

  const evaluatorInfo = spec?.evaluator as {
    name?: string;
    parameters?: Array<{ name: string; value: string }>;
  };
  const config = spec?.config as Record<string, unknown>;
  const queryRef = config?.queryRef as { name?: string };
  const message = status?.message as string | undefined;
  const hasMetadata =
    metadata &&
    typeof metadata === 'object' &&
    Object.keys(metadata).length > 0;
  const reasoning = metadata?.reasoning as string | undefined;

  // Check if this is an event evaluation
  const evaluationType = (spec?.type as string) || 'unknown';
  const isEventEvaluation =
    evaluationType === 'event' ||
    metadata?.rule_results ||
    metadata?.total_rules !== undefined ||
    metadata?.events_analyzed !== undefined;

  // Check if this is a metrics-based evaluation
  const evaluatorSpec = spec?.evaluator as { name?: string };
  const isMetricsEvaluation =
    evaluatorSpec?.name?.includes('metrics') ||
    evaluatorSpec?.name?.includes('performance') ||
    evaluatorSpec?.name?.includes('cost') ||
    (metadata?.cost !== undefined &&
      metadata?.performance_score !== undefined) ||
    (metadata?.token_score !== undefined &&
      metadata?.quality_score !== undefined) ||
    reasoning?.includes('threshold violations');

  // Check if this is a quality-based evaluation (LLM assessments)
  const isQualityEvaluation =
    !isEventEvaluation &&
    !isMetricsEvaluation &&
    hasMetadata &&
    (evaluatorSpec?.name?.includes('quality') ||
      evaluatorSpec?.name?.includes('llm') ||
      evaluatorSpec?.name?.includes('assessment') ||
      Object.keys(metadata).some(
        key =>
          key.toLowerCase().includes('accuracy') ||
          key.toLowerCase().includes('relevance') ||
          key.toLowerCase().includes('coherence') ||
          key.toLowerCase().includes('completeness') ||
          key.toLowerCase().includes('assessment') ||
          key.toLowerCase().includes('criterion') ||
          key.toLowerCase().includes('clarity') ||
          key.toLowerCase().includes('refusal_handling') ||
          key.toLowerCase().includes('appropriateness'),
      ) ||
      reasoning); // LLM evaluations often have reasoning text

  // Debug logging for development
  if (process.env.NODE_ENV === 'development') {
    console.log('EvaluationDetailView - metadata:', metadata);
    console.log('EvaluationDetailView - evaluatorSpec:', evaluatorSpec);
    console.log('EvaluationDetailView - isEventEvaluation:', isEventEvaluation);
    console.log(
      'EvaluationDetailView - isMetricsEvaluation:',
      isMetricsEvaluation,
    );
    console.log(
      'EvaluationDetailView - isQualityEvaluation:',
      isQualityEvaluation,
    );
    console.log('EvaluationDetailView - hasMetadata:', hasMetadata);
    console.log('EvaluationDetailView - reasoning present:', !!reasoning);
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {evaluation.name}
          </h1>
          <p className="text-muted-foreground">
            Evaluation in {namespace} namespace
          </p>
        </div>
        <div className="flex items-center gap-2">
          {enhancedAvailable && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setUseEnhanced(true)}
              className="flex items-center gap-2">
              <Sparkles className="h-3 w-3" />
              Enhanced View
            </Button>
          )}
          <StatusBadge
            status={(status?.phase as string) || 'unknown'}
            onCancel={canceling ? undefined : handleCancel}
          />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Overview Card */}
        <Card>
          <CardHeader className="hover:bg-muted/50 cursor-pointer transition-colors">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Overview
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-muted-foreground text-sm font-medium">
                  Type
                </p>
                <Badge variant="outline">
                  {(spec?.type as string) || 'unknown'}
                </Badge>
              </div>
              <div>
                <p className="text-muted-foreground text-sm font-medium">
                  Score
                </p>
                <p className="text-2xl font-bold">
                  {status?.score ? Number(status.score).toFixed(2) : '-'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm font-medium">
                  Passed
                </p>
                <div className="flex items-center gap-1">
                  {status?.passed === true ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : status?.passed === false ? (
                    <AlertCircle className="h-4 w-4 text-red-600" />
                  ) : null}
                  <span
                    className={`font-medium ${
                      status?.passed === true
                        ? 'text-green-600'
                        : status?.passed === false
                          ? 'text-red-600'
                          : 'text-muted-foreground'
                    }`}>
                    {status?.passed === true
                      ? 'Yes'
                      : status?.passed === false
                        ? 'No'
                        : 'Unknown'}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-muted-foreground text-sm font-medium">
                  Phase
                </p>
                <p className="font-medium capitalize">
                  {(status?.phase as string) || 'unknown'}
                </p>
              </div>
            </div>

            {message && (
              <>
                <Separator />
                <div>
                  <p className="text-muted-foreground mb-2 text-sm font-medium">
                    Message
                  </p>
                  <p className="text-sm">{message}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Configuration Card */}
        <Card>
          <CardHeader className="hover:bg-muted/50 cursor-pointer transition-colors">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Configuration
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <div>
              <p className="text-muted-foreground text-sm font-medium">
                Evaluator
              </p>
              <p className="font-medium">{evaluatorInfo?.name || '-'}</p>
            </div>

            {queryRef?.name && (
              <div>
                <p className="text-muted-foreground text-sm font-medium">
                  Query Reference
                </p>
                <p className="font-medium">{queryRef.name}</p>
              </div>
            )}

            {evaluatorInfo?.parameters &&
              evaluatorInfo.parameters.length > 0 && (
                <div>
                  <p className="text-muted-foreground mb-2 text-sm font-medium">
                    Parameters
                  </p>
                  <div className="space-y-2">
                    {evaluatorInfo.parameters.map((param, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between text-sm">
                        <span className="font-medium">{param.name}:</span>
                        <span className="text-muted-foreground font-mono">
                          {param.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </CardContent>
        </Card>
      </div>

      {/* Evaluation Display - Use appropriate display based on evaluation type */}
      {isEventEvaluation && hasMetadata ? (
        <EventMetricsDisplay
          eventMetadata={{
            total_rules: metadata.total_rules as number | undefined,
            passed_rules: metadata.passed_rules as number | undefined,
            failed_rules: metadata.failed_rules as number | undefined,
            rule_results: (() => {
              // First try to get structured rule_results
              const rules = metadata.rule_results;
              if (Array.isArray(rules)) {
                return rules;
              }
              if (typeof rules === 'string') {
                try {
                  const parsed = JSON.parse(rules);
                  if (Array.isArray(parsed)) return parsed;
                } catch {
                  // Continue to parse flattened format
                }
              }

              // Parse flattened rule format (rule_0_name_passed, rule_0_name_weight, etc.)
              const flattenedRules: {
                [key: string]: {
                  rule_name: string;
                  index: number;
                  passed?: boolean;
                  weight?: number;
                };
              } = {};
              Object.entries(metadata).forEach(([key, value]) => {
                const match = key.match(/^rule_(\d+)_(.+)_(passed|weight)$/);
                if (match) {
                  const [, ruleIndex, ruleName, attribute] = match;
                  const ruleKey = `${ruleIndex}_${ruleName}`;
                  if (!flattenedRules[ruleKey]) {
                    flattenedRules[ruleKey] = {
                      rule_name: ruleName.replace(/_/g, ' '),
                      index: parseInt(ruleIndex),
                    };
                  }
                  if (attribute === 'passed') {
                    flattenedRules[ruleKey].passed =
                      value === 'True' || value === true;
                  } else if (attribute === 'weight') {
                    flattenedRules[ruleKey].weight =
                      typeof value === 'string'
                        ? parseFloat(value)
                        : typeof value === 'number'
                          ? value
                          : undefined;
                  }
                }
              });

              // Convert to array format
              return Object.values(flattenedRules).sort(
                (a, b) => a.index - b.index,
              );
            })(),
            weighted_score: metadata.weighted_score as number | undefined,
            total_weight: metadata.total_weight as number | undefined,
            min_score_threshold: metadata.min_score_threshold as
              | number
              | undefined,
            events_analyzed: metadata.events_analyzed as number | undefined,
            query_name: metadata.query_name as string | undefined,
            session_id: metadata.session_id as string | undefined,
          }}
          queryName={queryRef?.name}
          evaluationSpec={spec}
        />
      ) : isMetricsEvaluation && hasMetadata ? (
        <MetricsEvaluationDisplay
          metadata={metadata}
          evaluationSpec={spec}
          reasoning={reasoning}
          overallPassed={status?.passed === true}
          overallScore={
            typeof status?.score === 'number'
              ? status.score
              : typeof status?.score === 'string'
                ? parseFloat(status.score)
                : undefined
          }
        />
      ) : isQualityEvaluation ? (
        <QualityEvaluationDisplay
          metadata={metadata}
          evaluationSpec={spec}
          reasoning={reasoning}
          overallPassed={status?.passed === true}
          overallScore={
            typeof status?.score === 'number'
              ? status.score
              : typeof status?.score === 'string'
                ? parseFloat(status.score)
                : undefined
          }
        />
      ) : hasMetadata ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Evaluation Metrics
            </CardTitle>
            <CardDescription>
              Detailed metrics and scores from the evaluation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Object.keys(metadata)
                .filter(key => !key.toLowerCase().includes('reasoning'))
                .map(key => {
                  const value = metadata[key];
                  return (
                    <div key={key}>
                      <p className="text-muted-foreground text-sm font-medium capitalize">
                        {key.replace(/_/g, ' ')}
                      </p>
                      <p className="font-mono text-sm">
                        {typeof value === 'string'
                          ? value
                          : JSON.stringify(value)}
                      </p>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Reasoning Card - only show for basic evaluations (not metrics or quality) */}
      {reasoning && !isMetricsEvaluation && !isQualityEvaluation && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Evaluation Reasoning
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{reasoning}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
