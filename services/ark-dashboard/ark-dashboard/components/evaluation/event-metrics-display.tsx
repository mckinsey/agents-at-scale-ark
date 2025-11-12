'use client';

import { CheckCircle, TrendingUp, XCircle } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { type ToggleOption, ToggleSwitch } from '@/components/ui/toggle-switch';
import type { EventEvaluationMetadata } from '@/lib/services/evaluations';

interface EventMetricsDisplayProps {
  eventMetadata: EventEvaluationMetadata;
  queryName?: string;
  sessionId?: string;
  evaluationSpec?: Record<string, unknown>;
}

// Helper to safely convert values to numbers
const toNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null) return undefined;
  const num = Number(value);
  return isNaN(num) ? undefined : num;
};

export function EventMetricsDisplay({
  eventMetadata,
  queryName,
  sessionId,
  evaluationSpec,
}: EventMetricsDisplayProps) {
  // Ensure we have valid data with fallbacks
  const {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    passed_rules = 0,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    failed_rules = 0,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    rule_results = [],
    // eslint-disable-next-line @typescript-eslint/naming-convention
    weighted_score,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    min_score_threshold,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    events_analyzed = 0,
    query_name: metadataQueryName,
    session_id: metadataSessionId,
  } = eventMetadata || {};

  // Ensure rule_results is always an array
  let validRuleResults = Array.isArray(rule_results) ? rule_results : [];

  // Enhance rule results with config information if available
  if (evaluationSpec?.config && Array.isArray(validRuleResults)) {
    const config = evaluationSpec.config as Record<string, unknown>;
    const configRules = Array.isArray(config.rules)
      ? (config.rules as Array<{ name?: string; expression?: string }>)
      : [];

    validRuleResults = validRuleResults.map((rule, index: number) => {
      const configRule = configRules[index];
      const ruleData = rule as Record<string, unknown>;
      return {
        rule_name: String(
          configRule?.name || ruleData.rule_name || `Rule ${index + 1}`,
        ),
        passed: Boolean(ruleData.passed),
        weight:
          typeof ruleData.weight === 'number' ? ruleData.weight : undefined,
        score: typeof ruleData.score === 'number' ? ruleData.score : undefined,
        reasoning:
          configRule?.expression ||
          (ruleData.reasoning as string) ||
          'No expression available',
        error: ruleData.error as string | undefined,
      };
    });
  }

  // Debug logging in development
  if (process.env.NODE_ENV === 'development') {
    console.log('EventMetricsDisplay - eventMetadata:', eventMetadata);
    console.log('EventMetricsDisplay - rule_results:', rule_results);
    console.log('EventMetricsDisplay - validRuleResults:', validRuleResults);
    console.log('EventMetricsDisplay - evaluationSpec:', evaluationSpec);
  }

  // Convert numeric values safely
  const safePassedRules = toNumber(passed_rules) ?? 0;
  const safeFailedRules = toNumber(failed_rules) ?? 0;
  const safeEventsAnalyzed = toNumber(events_analyzed) ?? 0;
  const safeMinThreshold = toNumber(min_score_threshold);
  const safeWeightedScore = toNumber(weighted_score);

  const displayQueryName = queryName || metadataQueryName || '—';
  const displaySessionId = sessionId || metadataSessionId || 'none';

  // View toggle state
  const [showCompactView, setShowCompactView] = useState(false);

  const viewOptions: ToggleOption[] = [
    { id: 'compact', label: 'compact view', active: !showCompactView },
    { id: 'card', label: 'card view', active: showCompactView },
  ];

  return (
    <div className="space-y-6">
      {/* Header with title, description, and toggle */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-2">
          <TrendingUp className="text-muted-foreground mt-0.5 h-5 w-5" />
          <div>
            <h3 className="text-lg font-semibold">Evaluation Metrics</h3>
            <p className="text-muted-foreground text-sm">
              Detailed metrics and scores from the evaluation
            </p>
          </div>
        </div>

        {validRuleResults.length > 0 && (
          <div className="flex-shrink-0">
            <ToggleSwitch
              options={viewOptions}
              onChange={id => setShowCompactView(id === 'card')}
            />
          </div>
        )}
      </div>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-4">
        <Badge
          variant="default"
          className="bg-green-600 px-3 py-1 text-white hover:bg-green-700">
          Passed Rules: {safePassedRules}
        </Badge>
        <Badge variant="destructive" className="px-3 py-1">
          Failed Rules: {safeFailedRules}
        </Badge>
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">Min Threshold:</span>
          <span>
            {safeMinThreshold !== undefined
              ? safeMinThreshold.toFixed(2)
              : '0.60'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">Events Analyzed:</span>
          <span>{safeEventsAnalyzed}</span>
        </div>
      </div>

      {/* Rules Display */}
      {validRuleResults.length > 0 ? (
        <>
          {/* Card View */}
          {showCompactView && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {validRuleResults.map((rule, index) => (
                <Card
                  key={`rule-${index}`}
                  className="relative overflow-hidden">
                  {/* Rule header with number and status */}
                  <div className="flex items-center justify-between p-4 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-sm font-medium">
                        Rule {index + 1}
                      </span>
                      <Badge
                        variant={rule.passed ? 'default' : 'destructive'}
                        className={`gap-1 ${
                          rule.passed
                            ? 'bg-green-600 hover:bg-green-700'
                            : 'bg-red-600 hover:bg-red-700'
                        }`}>
                        {rule.passed ? (
                          <>
                            <CheckCircle className="h-3 w-3" />
                            Passed
                          </>
                        ) : (
                          <>
                            <XCircle className="h-3 w-3" />
                            Failed
                          </>
                        )}
                      </Badge>
                    </div>
                  </div>

                  <CardContent className="space-y-3 pt-2">
                    {/* Rule Name */}
                    <div>
                      <p className="text-muted-foreground mb-1 text-xs">Name</p>
                      <p className="font-medium">
                        {rule.rule_name || `Rule ${index + 1}`}
                      </p>
                    </div>

                    {/* Weight */}
                    {rule.weight !== undefined && (
                      <div>
                        <p className="text-muted-foreground mb-1 text-xs">
                          Weight
                        </p>
                        <p className="font-medium">
                          {toNumber(rule.weight) ?? rule.weight}
                        </p>
                      </div>
                    )}

                    {/* Expression/Details */}
                    {(rule.reasoning || rule.error) && (
                      <div>
                        <p className="text-muted-foreground mb-1 text-xs">
                          Expression
                        </p>
                        <p className="text-foreground bg-muted/50 rounded p-2 font-mono text-sm">
                          {rule.reasoning ||
                            rule.error ||
                            'No expression available'}
                        </p>
                      </div>
                    )}

                    {/* Score if available */}
                    {rule.score !== undefined && (
                      <div className="border-t pt-2">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground text-xs">
                            Score
                          </span>
                          <span className="text-sm font-medium">
                            {toNumber(rule.score)?.toFixed(2) || '0.00'}
                          </span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Compact Row View */}
          {!showCompactView && (
            <div className="flex flex-col gap-2">
              {validRuleResults.map((rule, index) => (
                <div
                  key={`rule-${index}`}
                  className="bg-card hover:bg-accent/5 flex w-full items-center gap-4 rounded-md border px-4 py-3 shadow-sm transition-colors">
                  <div className="flex flex-1 items-center gap-3">
                    <div className="flex-shrink-0">
                      <Badge
                        variant={rule.passed ? 'default' : 'destructive'}
                        className={`gap-1 ${
                          rule.passed
                            ? 'bg-green-600 hover:bg-green-700'
                            : 'bg-red-600 hover:bg-red-700'
                        }`}>
                        {rule.passed ? (
                          <>
                            <CheckCircle className="h-3 w-3" />
                            Passed
                          </>
                        ) : (
                          <>
                            <XCircle className="h-3 w-3" />
                            Failed
                          </>
                        )}
                      </Badge>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <h4 className="truncate text-sm font-semibold">
                          {rule.rule_name || `Rule ${index + 1}`}
                        </h4>
                        {rule.weight !== undefined && (
                          <Badge variant="outline" className="text-xs">
                            Weight: {toNumber(rule.weight) ?? rule.weight}
                          </Badge>
                        )}
                      </div>

                      {(rule.reasoning || rule.error) && (
                        <div className="text-muted-foreground truncate font-mono text-xs">
                          {rule.reasoning ||
                            rule.error ||
                            'No expression available'}
                        </div>
                      )}
                    </div>
                  </div>

                  {rule.score !== undefined && (
                    <div className="flex-shrink-0 text-right">
                      <div className="text-sm font-medium">
                        {toNumber(rule.score)?.toFixed(2) || '0.00'}
                      </div>
                      <div className="text-muted-foreground text-xs">Score</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="bg-muted/30 flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center">
          <div className="text-muted-foreground">
            <p className="font-medium">No Individual Rule Details Available</p>
            <p className="mt-1 text-sm">
              Summary statistics show {safePassedRules} passed and{' '}
              {safeFailedRules} failed rules, but detailed rule information is
              not available.
            </p>
          </div>
        </div>
      )}

      {/* Footer with query info and weighted score */}
      <div className="text-muted-foreground flex flex-wrap items-center gap-2 border-t pt-4 text-sm">
        <span>
          Query:{' '}
          <span className="text-foreground font-medium">
            {displayQueryName}
          </span>
        </span>
        <span className="text-muted-foreground">·</span>
        <span>
          Session:{' '}
          <span className="text-foreground font-medium">
            {displaySessionId}
          </span>
        </span>
        {safeWeightedScore !== undefined && (
          <>
            <span className="text-muted-foreground">·</span>
            <span>
              Weighted Score:{' '}
              <span className="text-foreground font-medium">
                {safeWeightedScore.toFixed(3)}
              </span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
