'use client';

import {
  AlertTriangle,
  BarChart3,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Lightbulb,
  TrendingUp,
  XCircle,
  Zap,
} from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';

interface MetricData {
  name: string;
  value: number | string;
  threshold?: number | string;
  passed: boolean;
  unit?: string;
  type: 'cost' | 'performance' | 'token' | 'quality' | 'general';
  description?: string;
  recommendation?: string;
}

interface ViolationData {
  metric: string;
  currentValue: number | string;
  threshold: number | string;
  unit?: string;
  severity: 'high' | 'medium' | 'low';
  recommendation: string;
}

interface MetricsEvaluationDisplayProps {
  metadata: Record<string, unknown>;
  evaluationSpec: Record<string, unknown>;
  reasoning?: string;
  overallPassed: boolean;
  overallScore?: number;
}

const getMetricIcon = (type: string) => {
  switch (type) {
    case 'cost':
      return DollarSign;
    case 'performance':
      return Zap;
    case 'token':
      return BarChart3;
    case 'quality':
      return TrendingUp;
    default:
      return BarChart3;
  }
};

const formatValue = (value: number | string, unit?: string): string => {
  if (typeof value === 'number') {
    if (unit === 's' || unit === 'seconds') {
      return `${value.toFixed(2)}s`;
    }
    if (unit === '$' || unit === 'cost') {
      return `$${value.toFixed(4)}`;
    }
    if (unit === '%' || unit === 'percent') {
      return `${(value * 100).toFixed(1)}%`;
    }
    return value.toFixed(2);
  }
  return String(value);
};

const parseViolationsFromReasoning = (reasoning: string): ViolationData[] => {
  const violations: ViolationData[] = [];

  // Parse common violation patterns
  const durationMatch = reasoning.match(/maxDuration/i);
  const costMatch = reasoning.match(/maxCost/i);
  const tokenMatch = reasoning.match(/maxTokens|token/i);
  const responseMatch = reasoning.match(/maxResponseLength/i);

  if (durationMatch) {
    violations.push({
      metric: 'Duration',
      currentValue: 'Exceeded',
      threshold: '1s',
      unit: 's',
      severity: 'high',
      recommendation: 'Optimize query complexity or increase timeout threshold',
    });
  }

  if (costMatch) {
    violations.push({
      metric: 'Cost',
      currentValue: 'Exceeded',
      threshold: '$1.00',
      unit: '$',
      severity: 'medium',
      recommendation:
        'Use more cost-efficient models or reduce query complexity',
    });
  }

  if (tokenMatch) {
    violations.push({
      metric: 'Token Usage',
      currentValue: 'Exceeded',
      threshold: '10000',
      unit: 'tokens',
      severity: 'medium',
      recommendation:
        'Reduce input length or use models with higher token limits',
    });
  }

  if (responseMatch) {
    violations.push({
      metric: 'Response Length',
      currentValue: 'Exceeded',
      threshold: 'Limit',
      unit: 'chars',
      severity: 'low',
      recommendation:
        'Request more concise responses or increase length threshold',
    });
  }

  return violations;
};

const extractMetricsFromMetadata = (
  metadata: Record<string, unknown>,
  spec: Record<string, unknown>,
): MetricData[] => {
  const metrics: MetricData[] = [];
  const evaluator = spec.evaluator as {
    parameters?: Array<{ name: string; value: string }>;
  };
  const parameters = evaluator?.parameters || [];

  // Create parameter lookup for thresholds
  const paramLookup = parameters.reduce(
    (acc, param) => {
      acc[param.name] = param.value;
      return acc;
    },
    {} as Record<string, string>,
  );

  // Cost metrics
  if (metadata.cost !== undefined && metadata.cost_score !== undefined) {
    const cost =
      typeof metadata.cost === 'number'
        ? metadata.cost
        : parseFloat(String(metadata.cost));
    const costScore =
      typeof metadata.cost_score === 'number'
        ? metadata.cost_score
        : parseFloat(String(metadata.cost_score));

    if (!isNaN(cost) && !isNaN(costScore)) {
      metrics.push({
        name: 'Cost',
        value: cost,
        threshold: parseFloat(paramLookup.maxCostPerQuery || '1.0'),
        passed: costScore >= 0.5,
        unit: '$',
        type: 'cost',
        description: 'Total cost of query execution',
        recommendation:
          'Use more cost-efficient models or reduce query complexity',
      });
    }
  }

  // Performance metrics
  if (
    metadata.execution_time !== undefined &&
    metadata.performance_score !== undefined
  ) {
    const executionTime = parseFloat(
      String(metadata.execution_time).replace('s', ''),
    );
    const maxDuration = parseFloat(
      paramLookup.maxDuration?.replace('s', '') || '60',
    );
    const performanceScore =
      typeof metadata.performance_score === 'number'
        ? metadata.performance_score
        : parseFloat(String(metadata.performance_score));

    if (!isNaN(executionTime) && !isNaN(performanceScore)) {
      metrics.push({
        name: 'Execution Time',
        value: executionTime,
        threshold: maxDuration,
        passed:
          performanceScore >=
          parseFloat(paramLookup.performanceThreshold || '0.5'),
        unit: 's',
        type: 'performance',
        description: 'Time taken to execute the query',
        recommendation:
          'Optimize query complexity or increase timeout threshold',
      });
    }
  }

  // Token metrics
  if (
    metadata.token_score !== undefined &&
    metadata.total_tokens !== undefined
  ) {
    const tokenScore =
      typeof metadata.token_score === 'number'
        ? metadata.token_score
        : parseFloat(String(metadata.token_score));

    if (!isNaN(tokenScore)) {
      metrics.push({
        name: 'Token Efficiency',
        value: tokenScore,
        threshold: parseFloat(paramLookup.tokenEfficiencyThreshold || '0.3'),
        passed:
          tokenScore >=
          parseFloat(paramLookup.tokenEfficiencyThreshold || '0.3'),
        unit: 'score',
        type: 'token',
        description: 'Efficiency of token usage',
        recommendation:
          'Reduce input length or use models with better token efficiency',
      });
    }
  }

  // Quality metrics
  if (metadata.quality_score !== undefined) {
    const qualityScore =
      typeof metadata.quality_score === 'number'
        ? metadata.quality_score
        : parseFloat(String(metadata.quality_score));

    if (!isNaN(qualityScore)) {
      metrics.push({
        name: 'Quality Score',
        value: qualityScore,
        threshold: 0.7,
        passed: qualityScore >= 0.7,
        unit: 'score',
        type: 'quality',
        description: 'Overall quality of the response',
        recommendation: 'Improve prompt clarity or use higher-quality models',
      });
    }
  }

  return metrics;
};

function MetricCard({ metric }: { metric: MetricData }) {
  const Icon = getMetricIcon(metric.type);
  const progress = metric.threshold
    ? Math.min(100, (Number(metric.value) / Number(metric.threshold)) * 100)
    : Number(metric.value) * 100;

  return (
    <Card
      className={`${
        metric.passed
          ? 'border-green-200 bg-green-50/30'
          : 'border-red-200 bg-red-50/30'
      } dark:bg-transparent`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full ${
                metric.passed
                  ? 'bg-green-100 dark:bg-green-900/30'
                  : 'bg-red-100 dark:bg-red-900/30'
              }`}>
              <Icon
                className={`h-4 w-4 ${
                  metric.passed ? 'text-green-600' : 'text-red-600'
                }`}
              />
            </div>
            <span className="text-sm font-semibold">{metric.name}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Current</span>
          <span className="font-mono font-medium">
            {formatValue(metric.value, metric.unit)}
          </span>
        </div>

        {metric.threshold && (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Threshold</span>
              <span className="font-mono">
                {formatValue(metric.threshold, metric.unit)}
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">
                  Progress
                </span>
                <span
                  className={`font-bold ${
                    metric.passed ? 'text-green-600' : 'text-red-600'
                  }`}>
                  {Math.round(progress)}%
                </span>
              </div>
              <Progress
                value={progress}
                className={`h-3 ${
                  metric.passed
                    ? '[&>div]:bg-gradient-to-r [&>div]:from-green-500 [&>div]:to-green-600'
                    : '[&>div]:bg-gradient-to-r [&>div]:from-red-500 [&>div]:to-red-600'
                }`}
              />
            </div>
          </>
        )}

        {metric.description && (
          <p className="text-muted-foreground text-xs">{metric.description}</p>
        )}
      </CardContent>
    </Card>
  );
}

function ViolationsAlert({ violations }: { violations: ViolationData[] }) {
  if (violations.length === 0) return null;

  return (
    <Card className="border-red-200 bg-red-50/50 dark:bg-transparent">
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <CardTitle className="text-red-900 dark:text-red-400">
            Threshold Violations ({violations.length})
          </CardTitle>
        </div>
        <CardDescription className="text-red-700 dark:text-red-300">
          The following metrics exceeded their configured thresholds
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {violations.map((violation, index) => (
          <div
            key={index}
            className="flex items-start gap-3 rounded-md border bg-white/50 p-3 dark:bg-gray-900/20">
            <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{violation.metric}</span>
                <Badge
                  variant="outline"
                  className="border-red-200 text-xs text-red-700">
                  {violation.severity}
                </Badge>
              </div>
              <div className="text-muted-foreground text-xs">
                Current: {formatValue(violation.currentValue, violation.unit)} •
                Threshold: {formatValue(violation.threshold, violation.unit)}
              </div>
              <div className="flex items-start gap-2 text-xs">
                <Lightbulb className="mt-0.5 h-3 w-3 flex-shrink-0 text-yellow-500" />
                <span className="text-muted-foreground">
                  {violation.recommendation}
                </span>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function MetricsEvaluationDisplay({
  metadata,
  evaluationSpec,
  reasoning = '',
  overallPassed,
  overallScore,
}: MetricsEvaluationDisplayProps) {
  const [showDetails, setShowDetails] = useState(false);

  // Debug logging for development
  if (process.env.NODE_ENV === 'development') {
    console.log('MetricsEvaluationDisplay - metadata:', metadata);
    console.log(
      'MetricsEvaluationDisplay - overallScore:',
      overallScore,
      typeof overallScore,
    );
    console.log('MetricsEvaluationDisplay - evaluationSpec:', evaluationSpec);
  }

  const metrics = extractMetricsFromMetadata(metadata, evaluationSpec);
  const violations = parseViolationsFromReasoning(reasoning);

  return (
    <div className="space-y-6">
      {/* Overall Status */}
      <Card
        className={`min-h-[auto] ${
          overallPassed
            ? 'border-green-200 bg-green-50/30'
            : 'border-red-200 bg-red-50/30'
        } dark:bg-transparent`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-full ${
                  overallPassed
                    ? 'bg-green-100 dark:bg-green-900/30'
                    : 'bg-red-100 dark:bg-red-900/30'
                }`}>
                {overallPassed ? (
                  <CheckCircle className="h-7 w-7 text-green-600" />
                ) : (
                  <XCircle className="h-7 w-7 text-red-600" />
                )}
              </div>
              <div>
                <CardTitle
                  className={`text-xl ${
                    overallPassed
                      ? 'text-green-900 dark:text-green-100'
                      : 'text-red-900 dark:text-red-100'
                  }`}>
                  Evaluation {overallPassed ? 'Passed' : 'Failed'}
                </CardTitle>
                <CardDescription className="text-base">
                  {overallScore !== undefined &&
                    typeof overallScore === 'number' &&
                    `Overall Score: ${overallScore.toFixed(2)}`}
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Violations Alert */}
      <ViolationsAlert violations={violations} />

      {/* Metrics Grid */}
      {metrics.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Metric Performance</h3>
            <div className="text-muted-foreground text-sm">
              {metrics.filter(m => m.passed).length} of {metrics.length} metrics
              passed
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {metrics.map((metric, index) => (
              <MetricCard key={index} metric={metric} />
            ))}
          </div>
        </div>
      )}

      {/* Detailed Information */}
      <Collapsible open={showDetails} onOpenChange={setShowDetails}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full rounded-xl">
            <span>Detailed Information</span>
            {showDetails ? (
              <ChevronUp className="ml-2 h-4 w-4" />
            ) : (
              <ChevronDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4 space-y-4">
          {/* Raw Metrics */}
          <Card>
            <CardHeader>
              <CardTitle>Raw Metrics Data</CardTitle>
              <CardDescription>
                Complete metric values from the evaluation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {Object.entries(metadata)
                  .filter(([key]) => !key.toLowerCase().includes('reasoning'))
                  .map(([key, value]) => (
                    <div key={key} className="rounded">
                      <div className="text-muted-foreground text-xs font-medium capitalize">
                        {key.replace(/_/g, ' ')}
                      </div>
                      <div className="font-mono text-sm">
                        {typeof value === 'object'
                          ? JSON.stringify(value)
                          : String(value)}
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>

          {/* Evaluation Reasoning */}
          {reasoning && (
            <Card>
              <CardHeader>
                <CardTitle>Evaluation Reasoning</CardTitle>
                <CardDescription>
                  Detailed explanation of the evaluation results
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-1">
                <div className="bg-muted/50 rounded p-3 font-mono text-sm whitespace-pre-wrap">
                  {reasoning}
                </div>
              </CardContent>
            </Card>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
