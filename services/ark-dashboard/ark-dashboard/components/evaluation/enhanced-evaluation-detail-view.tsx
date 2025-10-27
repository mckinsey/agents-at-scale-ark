'use client';

import {
  AlertCircle,
  BarChart3,
  CheckCircle,
  Clock,
  FileText,
  Play,
  Settings,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDelayedLoading } from '@/lib/hooks/use-delayed-loading';
import type { EnhancedEvaluationDetailResponse } from '@/lib/services/evaluations';
import { evaluationsService } from '@/lib/services/evaluations';

// import { RuleResultsComponent } from "./rule-results-component" // Alternative component for rule display
import { CategoryBreakdownComponent } from './category-breakdown-component';
import { EventMetricsDisplay } from './event-metrics-display';
import { MetadataCardsComponent } from './metadata-cards-component';
import { RawMetadataComponent } from './raw-metadata-component';
import { ScoreChartComponent } from './score-chart-component';
import { TimelineComponent } from './timeline-component';

interface EnhancedEvaluationDetailViewProps {
  evaluationId: string;
  namespace: string;
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

export function EnhancedEvaluationDetailView({
  evaluationId,
  namespace,
}: EnhancedEvaluationDetailViewProps) {
  const [evaluation, setEvaluation] =
    useState<EnhancedEvaluationDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);
  const showLoading = useDelayedLoading(loading);

  const loadEvaluation = useCallback(async () => {
    try {
      const data =
        await evaluationsService.getEnhancedDetailsByName(evaluationId);
      setEvaluation(data);
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

  const handleCancel = async () => {
    if (!evaluation) return;

    setCanceling(true);
    try {
      await evaluationsService.cancel(evaluation.name);
      toast('Evaluation Canceled', {
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

  if (showLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">
          Loading enhanced evaluation details...
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
      metadata[metadataKey] = value;
    }
  });

  const enhancedMetadata = evaluation.enhanced_metadata;

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

  // Determine the evaluation type for tab display
  const evaluationType =
    enhancedMetadata?.evaluation_type ||
    (typeof spec?.type === 'string' ? spec.type : 'unknown') ||
    'unknown';

  // Check what enhanced components we can show
  const hasRuleResults =
    enhancedMetadata?.event_metadata?.rule_results &&
    enhancedMetadata.event_metadata.rule_results.length > 0;
  const hasCategoryBreakdown =
    enhancedMetadata?.category_breakdown &&
    enhancedMetadata.category_breakdown.length > 0;
  const hasEnhancedMetadata =
    enhancedMetadata &&
    (enhancedMetadata.event_metadata ||
      enhancedMetadata.baseline_metadata ||
      enhancedMetadata.query_metadata ||
      enhancedMetadata.batch_metadata ||
      enhancedMetadata.direct_metadata);

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {evaluation.name}
          </h1>
          <p className="text-muted-foreground">
            Enhanced evaluation in {namespace} namespace
          </p>
        </div>
        <StatusBadge
          status={(status?.phase as string) || 'unknown'}
          onCancel={canceling ? undefined : handleCancel}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Overview Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-muted-foreground text-sm font-medium">
                  Type
                </p>
                <Badge variant="outline" className="capitalize">
                  {evaluationType}
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
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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

      {/* Enhanced Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="flex">
          <TabsTrigger value="overview" className="px-10">
            Overview
          </TabsTrigger>
          {hasRuleResults && (
            <TabsTrigger value="rules" className="px-10">
              Rules
            </TabsTrigger>
          )}
          {hasCategoryBreakdown && (
            <TabsTrigger value="categories" className="px-10">
              Categories
            </TabsTrigger>
          )}
          {hasEnhancedMetadata && (
            <TabsTrigger value="enhanced" className="px-10">
              Enhanced
            </TabsTrigger>
          )}
          <TabsTrigger value="charts" className="px-10">
            Charts
          </TabsTrigger>
          <TabsTrigger value="debug" className="px-10">
            Debug
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Basic Metrics Card */}
          {hasMetadata && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Basic Metrics
                </CardTitle>
                <CardDescription>
                  Standard evaluation metrics and scores
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(metadata).map(([key, value]) => (
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
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Reasoning Card */}
          {reasoning && (
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
        </TabsContent>

        {hasRuleResults && (
          <TabsContent value="rules">
            <EventMetricsDisplay
              eventMetadata={enhancedMetadata!.event_metadata!}
              queryName={queryRef?.name}
              sessionId={metadata?.session_id as string | undefined}
              evaluationSpec={spec}
            />
          </TabsContent>
        )}

        {hasCategoryBreakdown && (
          <TabsContent value="categories">
            <CategoryBreakdownComponent
              categories={enhancedMetadata!.category_breakdown!}
            />
          </TabsContent>
        )}

        {hasEnhancedMetadata && (
          <TabsContent value="enhanced" className="space-y-6">
            <MetadataCardsComponent metadata={enhancedMetadata!} />
          </TabsContent>
        )}

        <TabsContent value="charts" className="space-y-6">
          {/* Score Charts */}
          {hasCategoryBreakdown && (
            <ScoreChartComponent
              title="Category Performance"
              description="Score breakdown by evaluation category"
              data={enhancedMetadata!.category_breakdown!.map(cat => ({
                label: cat.category,
                score: cat.score || 0,
                passed: cat.passed,
                weight: cat.weight,
              }))}
              showTrend={true}
            />
          )}

          {/* Rule Results Chart */}
          {hasRuleResults && (
            <ScoreChartComponent
              title="Rule Performance"
              description="Individual rule scores and results"
              data={enhancedMetadata!.event_metadata!.rule_results!.map(
                rule => ({
                  label: rule.rule_name,
                  score: rule.score || (rule.passed ? 1 : 0),
                  passed: rule.passed,
                  weight: rule.weight,
                }),
              )}
              showTrend={false}
            />
          )}

          {/* Timeline for batch evaluations */}
          {enhancedMetadata?.batch_metadata?.evaluation_results && (
            <TimelineComponent
              title="Batch Evaluation Timeline"
              description="Progress of individual evaluations in the batch"
              events={enhancedMetadata.batch_metadata.evaluation_results.map(
                (result, index) => ({
                  id: `batch-${index}`,
                  timestamp:
                    typeof result.timestamp === 'string'
                      ? result.timestamp
                      : new Date().toISOString(),
                  title:
                    typeof result.name === 'string'
                      ? result.name
                      : `Evaluation ${index + 1}`,
                  description:
                    typeof result.description === 'string'
                      ? result.description
                      : undefined,
                  status: result.passed
                    ? ('completed' as const)
                    : result.failed
                      ? ('failed' as const)
                      : ('pending' as const),
                  metadata: {
                    score: result.score,
                    duration: result.duration,
                  },
                }),
              )}
            />
          )}

          {/* Fallback message if no charts available */}
          {!hasCategoryBreakdown &&
            !hasRuleResults &&
            !enhancedMetadata?.batch_metadata?.evaluation_results && (
              <Card>
                <CardContent className="p-6">
                  <div className="text-muted-foreground text-center">
                    <BarChart3 className="mx-auto mb-4 h-12 w-12" />
                    <h3 className="mb-2 text-lg font-medium">
                      No Chart Data Available
                    </h3>
                    <p>
                      Enhanced metadata does not contain sufficient data for
                      visualization.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
        </TabsContent>

        <TabsContent value="debug">
          <RawMetadataComponent
            metadata={enhancedMetadata || {}}
            rawMetadata={metadata}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
