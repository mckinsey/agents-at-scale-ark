'use client';

import { AlertCircle, CheckCircle, XCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { EventEvaluationMetadata } from '@/lib/services/evaluations';

interface RuleResultsComponentProps {
  eventMetadata: EventEvaluationMetadata;
}

export function RuleResultsComponent({
  eventMetadata,
}: RuleResultsComponentProps) {
  const {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    total_rules,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    passed_rules,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    failed_rules,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    rule_results,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    weighted_score,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    total_weight,
  } = eventMetadata;

  const passRate = total_rules ? ((passed_rules || 0) / total_rules) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5" />
          Rule Evaluation Results
        </CardTitle>
        <CardDescription>
          Individual rule outcomes and scoring breakdown
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary Statistics */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">
              {passed_rules || 0}
            </p>
            <p className="text-muted-foreground text-sm">Passed</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-red-600">
              {failed_rules || 0}
            </p>
            <p className="text-muted-foreground text-sm">Failed</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{total_rules || 0}</p>
            <p className="text-muted-foreground text-sm">Total Rules</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{passRate.toFixed(1)}%</p>
            <p className="text-muted-foreground text-sm">Pass Rate</p>
          </div>
        </div>

        {/* Pass Rate Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Rule Pass Rate</span>
            <span>{passRate.toFixed(1)}%</span>
          </div>
          <Progress value={passRate} className="h-2" />
        </div>

        {/* Weighted Score (if available) */}
        {weighted_score !== undefined && total_weight !== undefined && (
          <div className="bg-muted/50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">Weighted Score</span>
              <span className="text-lg font-bold">
                {weighted_score.toFixed(2)} / {total_weight.toFixed(2)}
              </span>
            </div>
            <div className="mt-2">
              <Progress
                value={(weighted_score / total_weight) * 100}
                className="h-2"
              />
            </div>
          </div>
        )}

        {/* Individual Rule Results */}
        {rule_results && rule_results.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-medium">Individual Rule Results</h4>
            <div className="space-y-2">
              {rule_results.map((rule, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    {rule.passed ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600" />
                    )}
                    <div>
                      <p className="font-medium">{rule.rule_name}</p>
                      {rule.reasoning && (
                        <p className="text-muted-foreground text-sm">
                          {rule.reasoning}
                        </p>
                      )}
                      {rule.error && (
                        <p className="flex items-center gap-1 text-sm text-red-600">
                          <AlertCircle className="h-3 w-3" />
                          {rule.error}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {rule.score !== undefined && (
                      <Badge variant="outline">
                        Score: {rule.score.toFixed(2)}
                      </Badge>
                    )}
                    {rule.weight !== undefined && (
                      <Badge variant="secondary">Weight: {rule.weight}</Badge>
                    )}
                    <Badge variant={rule.passed ? 'default' : 'destructive'}>
                      {rule.passed ? 'PASS' : 'FAIL'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
