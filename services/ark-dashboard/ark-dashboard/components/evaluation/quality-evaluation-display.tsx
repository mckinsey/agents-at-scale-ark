'use client';

import {
  AlertTriangle,
  BarChart3,
  Brain,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  MessageCircle,
  Star,
  Target,
  XCircle,
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

interface QualityMetric {
  name: string;
  value: number | string;
  threshold?: number;
  passed: boolean;
  unit?: string;
  type:
    | 'accuracy'
    | 'relevance'
    | 'coherence'
    | 'completeness'
    | 'reasoning'
    | 'general';
  description?: string;
  recommendation?: string;
  confidence?: number;
}

interface QualityAssessment {
  criterion: string;
  score: number | string;
  passed: boolean;
  reasoning?: string;
  weight?: number;
  confidence?: number;
}

interface QualityEvaluationDisplayProps {
  metadata: Record<string, unknown>;
  evaluationSpec: Record<string, unknown>;
  reasoning?: string;
  overallPassed: boolean;
  overallScore?: number;
}

const getQualityIcon = (type: string) => {
  switch (type) {
    case 'accuracy':
      return Target;
    case 'relevance':
      return Brain;
    case 'coherence':
      return MessageCircle;
    case 'completeness':
      return BarChart3;
    case 'reasoning':
      return Lightbulb;
    default:
      return Star;
  }
};

const formatQualityValue = (value: number | string, unit?: string): string => {
  if (typeof value === 'number') {
    if (unit === '%' || unit === 'percent') {
      return `${(value * 100).toFixed(1)}%`;
    }
    if (unit === 'score' || !unit) {
      return value.toFixed(2);
    }
    return value.toFixed(2);
  }
  return String(value);
};

const addMetricFromCriteria = (
  criteriaName: string,
  score: number,
  metrics: QualityMetric[],
) => {
  let metricType: QualityMetric['type'] = 'general';
  let description = '';
  let recommendation = '';
  let threshold = 0.7; // Default threshold

  // Determine metric type and details based on criteria name
  const keyLower = criteriaName.toLowerCase();

  if (keyLower.includes('accuracy') || keyLower.includes('correct')) {
    metricType = 'accuracy';
    description = 'How accurate the response is to the ground truth';
    recommendation = 'Improve model prompting or use more accurate models';
  } else if (keyLower.includes('relevance') || keyLower.includes('relevant')) {
    metricType = 'relevance';
    description = 'How relevant the response is to the query';
    recommendation = 'Refine the query or improve context understanding';
  } else if (
    keyLower.includes('coherence') ||
    keyLower.includes('coherent') ||
    keyLower.includes('consistency')
  ) {
    metricType = 'coherence';
    description = 'How coherent and consistent the response is';
    recommendation =
      'Improve prompt structure or use models with better reasoning';
  } else if (
    keyLower.includes('completeness') ||
    keyLower.includes('complete') ||
    keyLower.includes('coverage')
  ) {
    metricType = 'completeness';
    description = 'How complete the response is in addressing the query';
    recommendation = 'Ensure queries are comprehensive and well-structured';
  } else if (keyLower.includes('reasoning') || keyLower.includes('logic')) {
    metricType = 'reasoning';
    description = 'Quality of reasoning and logical flow in the response';
    recommendation = 'Use models with stronger reasoning capabilities';
  } else if (keyLower.includes('clarity')) {
    metricType = 'coherence';
    description = 'How clear and understandable the response is';
    recommendation = 'Use clearer language and better structure';
  } else if (
    keyLower.includes('refusal_handling') ||
    keyLower.includes('refusal')
  ) {
    metricType = 'reasoning';
    description = 'How well the system handles refusal scenarios';
    recommendation = 'Improve refusal detection and response strategies';
    threshold = 0.5; // Lower threshold for refusal handling
  } else if (
    keyLower.includes('appropriateness') ||
    keyLower.includes('appropriate')
  ) {
    metricType = 'relevance';
    description = 'How appropriate the response is for the context';
    recommendation = 'Improve context understanding and response filtering';
  } else if (keyLower.includes('usefulness') || keyLower.includes('useful')) {
    metricType = 'relevance';
    description = 'How useful the response is for the intended purpose';
    recommendation =
      'Ensure responses provide actionable and valuable information';
  } else if (
    keyLower.includes('compliance') ||
    keyLower.includes('compliant')
  ) {
    metricType = 'accuracy';
    description =
      'How well the response complies with requirements and guidelines';
    recommendation = 'Review and strengthen compliance checks and guidelines';
    threshold = 0.8; // Higher threshold for compliance
  } else if (keyLower.includes('score') || keyLower.includes('quality')) {
    metricType = 'general';
    description = 'Overall quality assessment';
    recommendation = 'Review and optimize the evaluation criteria';
    threshold = 0.8; // Higher threshold for overall quality
  }

  const passed = score >= threshold;

  metrics.push({
    name: criteriaName
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase()),
    value: score,
    threshold,
    passed,
    unit: 'score',
    type: metricType,
    description,
    recommendation,
    confidence: score, // Use score as confidence for now
  });
};

const extractQualityMetricsFromMetadata = (
  metadata: Record<string, unknown>,
): QualityMetric[] => {
  const metrics: QualityMetric[] = [];

  // Skip non-metric keys
  const skipKeys = [
    'reasoning',
    'model_base_url',
    'model_used',
    'query_name',
    'query_namespace',
    'query_id',
    'min_score_threshold',
  ];

  // First, check if we have evaluation_scope to get the list of criteria
  const evaluationScope = metadata.evaluation_scope as string | undefined;
  let criteriaList: string[] = [];

  if (evaluationScope && typeof evaluationScope === 'string') {
    criteriaList = evaluationScope.split(',').map(c => c.trim());
  }

  // Debug logging
  if (process.env.NODE_ENV === 'development') {
    console.log('Debug - criteriaList:', criteriaList);
    console.log('Debug - metadata keys:', Object.keys(metadata));
  }

  // If we have criteria list, try to create metrics for each criteria with score 1.0 as default
  // This handles cases where the evaluation passed but individual scores aren't stored separately
  if (criteriaList.length > 0) {
    criteriaList.forEach(criterion => {
      // Look for the criterion as a direct key
      const directKey = Object.keys(metadata).find(
        key => key.toLowerCase() === criterion.toLowerCase(),
      );

      if (directKey) {
        const value = metadata[directKey];
        const score =
          typeof value === 'number'
            ? value
            : typeof value === 'string'
              ? parseFloat(value)
              : null;

        if (score !== null && !isNaN(score)) {
          addMetricFromCriteria(criterion, score, metrics);
          return;
        }
      }

      // If no direct key found, create metric with perfect score (since overall assessment passed)
      // This is a fallback for when criteria are defined but individual scores aren't stored
      if (process.env.NODE_ENV === 'development') {
        console.log(
          `Debug - No score found for ${criterion}, using 1.0 as fallback`,
        );
      }
      addMetricFromCriteria(criterion, 1.0, metrics);
    });
  }

  // Also look for other patterns
  Object.entries(metadata).forEach(([key, value]) => {
    // Skip keys that are not quality metrics
    if (
      skipKeys.some(skipKey =>
        key.toLowerCase().includes(skipKey.toLowerCase()),
      )
    ) {
      return;
    }

    // Handle the case where criteria_scores might contain multiple criteria
    if (key.toLowerCase() === 'criteria_scores' && typeof value === 'string') {
      // Parse criteria_scores string like "refusal_handling=0.0,appropriateness=0.1,clarity=0.9"
      const criteriaEntries = value.split(',').map(entry => entry.trim());
      criteriaEntries.forEach(entry => {
        const [criteriaName, scoreStr] = entry.split('=').map(s => s.trim());
        const score = parseFloat(scoreStr);
        if (!isNaN(score) && score >= 0 && score <= 1) {
          // Remove existing metric for this criteria to avoid duplicates
          const existingIndex = metrics.findIndex(
            m =>
              m.name.toLowerCase().replace(/\s+/g, '_') ===
              criteriaName.toLowerCase(),
          );
          if (existingIndex >= 0) {
            metrics.splice(existingIndex, 1);
          }
          addMetricFromCriteria(criteriaName, score, metrics);
        }
      });
      return;
    }

    // Skip evaluation_scope itself (it's not a score)
    if (key.toLowerCase() === 'evaluation_scope') {
      return;
    }

    const numericValue =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? parseFloat(value)
          : null;

    if (
      numericValue !== null &&
      !isNaN(numericValue) &&
      numericValue >= 0 &&
      numericValue <= 1
    ) {
      // If we have a criteria list, only include metrics that are in the scope
      if (criteriaList.length > 0) {
        const isInScope = criteriaList.some(
          criterion =>
            criterion.toLowerCase() === key.toLowerCase() ||
            key.toLowerCase().includes(criterion.toLowerCase()),
        );
        if (isInScope) {
          // Remove existing metric for this criteria to avoid duplicates
          const existingIndex = metrics.findIndex(
            m =>
              m.name.toLowerCase().replace(/\s+/g, '_') === key.toLowerCase(),
          );
          if (existingIndex >= 0) {
            metrics.splice(existingIndex, 1);
          }
          addMetricFromCriteria(key, numericValue, metrics);
        }
      } else {
        // No specific criteria list, include any numeric metric
        addMetricFromCriteria(key, numericValue, metrics);
      }
    }
  });

  if (process.env.NODE_ENV === 'development') {
    console.log('Debug - final metrics:', metrics);
  }
  return metrics;
};

const extractQualityAssessments = (
  metadata: Record<string, unknown>,
): QualityAssessment[] => {
  const assessments: QualityAssessment[] = [];

  // Look for assessment patterns in metadata
  Object.entries(metadata).forEach(([key, value]) => {
    if (
      key.toLowerCase().includes('assessment') ||
      key.toLowerCase().includes('criterion')
    ) {
      const numericValue =
        typeof value === 'number'
          ? value
          : typeof value === 'string'
            ? parseFloat(value)
            : null;

      if (numericValue !== null && !isNaN(numericValue)) {
        assessments.push({
          criterion: key
            .replace(/_/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase()),
          score: numericValue,
          passed: numericValue >= 0.7,
          reasoning: (metadata[`${key}_reasoning`] as string) || undefined,
          weight: 1.0,
          confidence: numericValue,
        });
      }
    }
  });

  return assessments;
};

function QualityMetricCard({ metric }: { metric: QualityMetric }) {
  const Icon = getQualityIcon(metric.type);
  const progress = metric.threshold
    ? Math.min(100, (Number(metric.value) / metric.threshold) * 100)
    : Number(metric.value) * 100;

  return (
    <Card
      className={`${metric.passed ? 'border-green-200 bg-green-50/30' : 'border-red-200 bg-red-50/30'} dark:bg-transparent`}>
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
                className={`h-4 w-4 ${metric.passed ? 'text-green-600' : 'text-red-600'}`}
              />
            </div>
            <span className="text-sm font-semibold">{metric.name}</span>
          </div>
          {metric.confidence && (
            <Badge variant="outline" className="text-xs">
              {(metric.confidence * 100).toFixed(0)}%
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Score</span>
          <span className="font-mono font-medium">
            {formatQualityValue(metric.value, metric.unit)}
          </span>
        </div>

        {metric.threshold && (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Threshold</span>
              <span className="font-mono">
                {formatQualityValue(metric.threshold, metric.unit)}
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">
                  Performance
                </span>
                <span
                  className={`font-bold ${metric.passed ? 'text-green-600' : 'text-red-600'}`}>
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

function QualityAssessmentCard({
  assessment,
}: {
  assessment: QualityAssessment;
}) {
  return (
    <Card
      className={`${assessment.passed ? 'border-green-200 bg-green-50/30' : 'border-red-200 bg-red-50/30'} dark:bg-transparent`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full ${
                assessment.passed
                  ? 'bg-green-100 dark:bg-green-900/30'
                  : 'bg-red-100 dark:bg-red-900/30'
              }`}>
              {assessment.passed ? (
                <CheckCircle className="h-3 w-3 text-green-600" />
              ) : (
                <XCircle className="h-3 w-3 text-red-600" />
              )}
            </div>
            <span className="text-sm font-medium">{assessment.criterion}</span>
          </div>
          <Badge
            variant={assessment.passed ? 'default' : 'destructive'}
            className="text-xs">
            {formatQualityValue(assessment.score)}
          </Badge>
        </div>
      </CardHeader>
      {assessment.reasoning && (
        <CardContent className="pt-0">
          <p className="text-muted-foreground text-xs">
            {assessment.reasoning}
          </p>
        </CardContent>
      )}
    </Card>
  );
}

function QualityIssuesAlert({
  failedMetrics,
}: {
  failedMetrics: QualityMetric[];
}) {
  if (failedMetrics.length === 0) return null;

  return (
    <Card className="border-red-200 bg-red-50/50 dark:bg-transparent">
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <CardTitle className="text-red-900 dark:text-red-400">
            Quality Issues ({failedMetrics.length})
          </CardTitle>
        </div>
        <CardDescription className="text-red-700 dark:text-red-300">
          The following quality criteria did not meet the required thresholds
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {failedMetrics.map((metric, index) => (
          <div
            key={index}
            className="flex items-start gap-3 rounded-md border bg-white/50 p-3 dark:bg-gray-900/20">
            <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{metric.name}</span>
                <Badge
                  variant="outline"
                  className="border-red-200 text-xs text-red-700">
                  {formatQualityValue(metric.value, metric.unit)}
                </Badge>
              </div>
              <div className="text-muted-foreground text-xs">
                Required:{' '}
                {formatQualityValue(metric.threshold || 0.7, metric.unit)}
              </div>
              {metric.recommendation && (
                <div className="flex items-start gap-2 text-xs">
                  <Lightbulb className="mt-0.5 h-3 w-3 flex-shrink-0 text-yellow-500" />
                  <span className="text-muted-foreground">
                    {metric.recommendation}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function QualityEvaluationDisplay({
  metadata,
  reasoning = '',
  overallPassed,
  overallScore,
}: QualityEvaluationDisplayProps) {
  const [showDetails, setShowDetails] = useState(false);

  const qualityMetrics = extractQualityMetricsFromMetadata(metadata);
  const qualityAssessments = extractQualityAssessments(metadata);
  const failedMetrics = qualityMetrics.filter(m => !m.passed);

  // Debug logging for development
  if (process.env.NODE_ENV === 'development') {
    console.log('QualityEvaluationDisplay - metadata:', metadata);
    console.log(
      'QualityEvaluationDisplay - metadata keys:',
      Object.keys(metadata),
    );
    console.log(
      'QualityEvaluationDisplay - evaluation_scope:',
      metadata.evaluation_scope,
    );
    console.log(
      'QualityEvaluationDisplay - qualityMetrics found:',
      qualityMetrics,
    );
    console.log(
      'QualityEvaluationDisplay - qualityAssessments:',
      qualityAssessments,
    );

    // Log each metadata entry to see what we have
    Object.entries(metadata).forEach(([key, value]) => {
      console.log(
        `QualityEvaluationDisplay - ${key}:`,
        value,
        `(type: ${typeof value})`,
      );
    });
  }

  return (
    <div className="space-y-6">
      {/* Overall Status */}
      <Card
        className={`${overallPassed ? 'border-green-200 bg-green-50/30' : 'border-red-200 bg-red-50/30'} dark:bg-transparent`}>
        <CardHeader className="pb-6">
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
                  className={`mb-1 text-xl ${overallPassed ? 'text-green-900 dark:text-green-100' : 'text-red-900 dark:text-red-100'}`}>
                  Quality Assessment {overallPassed ? 'Passed' : 'Failed'}
                </CardTitle>
                <CardDescription className="text-base">
                  {overallScore !== undefined &&
                    typeof overallScore === 'number' &&
                    `Overall Quality Score: ${overallScore.toFixed(2)}`}
                  {qualityMetrics.length > 0 && (
                    <span className="ml-2">
                      • {qualityMetrics.filter(m => m.passed).length} of{' '}
                      {qualityMetrics.length} criteria met
                    </span>
                  )}
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Quality Issues Alert */}
      <QualityIssuesAlert failedMetrics={failedMetrics} />

      {/* Quality Metrics Grid */}
      {qualityMetrics.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Quality Criteria</h3>
            <div className="text-muted-foreground text-sm">
              {qualityMetrics.filter(m => m.passed).length} of{' '}
              {qualityMetrics.length} criteria passed
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {qualityMetrics.map((metric, index) => (
              <QualityMetricCard key={index} metric={metric} />
            ))}
          </div>
        </div>
      )}

      {/* Quality Assessments */}
      {qualityAssessments.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Detailed Assessments</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {qualityAssessments.map((assessment, index) => (
              <QualityAssessmentCard key={index} assessment={assessment} />
            ))}
          </div>
        </div>
      )}

      {/* Detailed Information */}
      <Collapsible open={showDetails} onOpenChange={setShowDetails}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full">
            <span>Detailed Information</span>
            {showDetails ? (
              <ChevronUp className="ml-2 h-4 w-4" />
            ) : (
              <ChevronDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4 space-y-4">
          {/* Raw Quality Data */}
          <Card>
            <CardHeader>
              <CardTitle>Raw Quality Data</CardTitle>
              <CardDescription>
                Complete quality assessment values from the evaluation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {Object.entries(metadata)
                  .filter(([key]) => !key.toLowerCase().includes('reasoning'))
                  .map(([key, value]) => (
                    <div key={key} className="bg-muted/50 rounded p-2">
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
                  Detailed explanation of the quality assessment
                </CardDescription>
              </CardHeader>
              <CardContent>
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
