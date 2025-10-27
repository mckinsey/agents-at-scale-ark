'use client';

import { Activity, Target, TrendingUp, Users, Zap } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type {
  BaselineEvaluationMetadata,
  BatchEvaluationMetadata,
  DirectEvaluationMetadata,
  EnhancedEvaluationMetadata,
  EventEvaluationMetadata,
  QueryEvaluationMetadata,
} from '@/lib/services/evaluations';

interface MetadataCardsComponentProps {
  metadata: EnhancedEvaluationMetadata;
}

function formatDuration(seconds: number): string {
  if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds.toFixed(1)}s`;
}

function EventMetadataCard({
  metadata,
}: {
  metadata: EventEvaluationMetadata;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Event Analysis
        </CardTitle>
        <CardDescription>Event-based evaluation metrics</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {metadata.events_analyzed !== undefined && (
            <div>
              <p className="text-muted-foreground text-sm font-medium">
                Events Analyzed
              </p>
              <p className="text-2xl font-bold">{metadata.events_analyzed}</p>
            </div>
          )}
          {metadata.session_id && (
            <div>
              <p className="text-muted-foreground text-sm font-medium">
                Session ID
              </p>
              <p className="font-mono text-sm">{metadata.session_id}</p>
            </div>
          )}
          {metadata.query_name && (
            <div className="col-span-2">
              <p className="text-muted-foreground text-sm font-medium">Query</p>
              <Badge variant="outline">{metadata.query_name}</Badge>
            </div>
          )}
        </div>

        {metadata.min_score_threshold !== undefined && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Score Threshold</span>
              <span>{metadata.min_score_threshold.toFixed(2)}</span>
            </div>
            <Progress
              value={metadata.min_score_threshold * 100}
              className="h-2"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BaselineMetadataCard({
  metadata,
}: {
  metadata: BaselineEvaluationMetadata;
}) {
  const improvement = metadata.improvement || 0;
  const improvementPercent = improvement * 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Baseline Comparison
        </CardTitle>
        <CardDescription>
          Comparison against baseline performance
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-muted-foreground text-sm font-medium">
              Baseline Score
            </p>
            <p className="text-2xl font-bold">
              {metadata.baseline_score?.toFixed(2) || '-'}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-sm font-medium">
              Current Score
            </p>
            <p className="text-2xl font-bold">
              {metadata.current_score?.toFixed(2) || '-'}
            </p>
          </div>
        </div>

        {metadata.improvement !== undefined && (
          <div
            className={`rounded-lg p-3 ${
              improvement > 0
                ? 'border border-green-200 bg-green-50'
                : improvement < 0
                  ? 'border border-red-200 bg-red-50'
                  : 'border border-gray-200 bg-gray-50'
            }`}>
            <div className="flex items-center justify-between">
              <span className="font-medium">Improvement</span>
              <div className="flex items-center gap-2">
                <span
                  className={`font-bold ${
                    improvement > 0
                      ? 'text-green-600'
                      : improvement < 0
                        ? 'text-red-600'
                        : 'text-gray-600'
                  }`}>
                  {improvement > 0 ? '+' : ''}
                  {improvementPercent.toFixed(1)}%
                </span>
                <Badge
                  variant={
                    improvement > 0
                      ? 'default'
                      : improvement < 0
                        ? 'destructive'
                        : 'secondary'
                  }>
                  {improvement > 0
                    ? 'IMPROVED'
                    : improvement < 0
                      ? 'DECLINED'
                      : 'UNCHANGED'}
                </Badge>
              </div>
            </div>
          </div>
        )}

        {metadata.comparison_threshold !== undefined && (
          <div>
            <p className="text-muted-foreground mb-1 text-sm font-medium">
              Comparison Threshold
            </p>
            <Badge variant="outline">
              {metadata.comparison_threshold.toFixed(2)}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QueryMetadataCard({
  metadata,
}: {
  metadata: QueryEvaluationMetadata;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          Query Performance
        </CardTitle>
        <CardDescription>Query execution and response metrics</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {metadata.query_name && (
            <div>
              <p className="text-muted-foreground text-sm font-medium">
                Query Name
              </p>
              <Badge variant="outline">{metadata.query_name}</Badge>
            </div>
          )}
          {metadata.query_status && (
            <div>
              <p className="text-muted-foreground text-sm font-medium">
                Status
              </p>
              <Badge
                variant={
                  metadata.query_status === 'completed'
                    ? 'default'
                    : 'secondary'
                }>
                {metadata.query_status}
              </Badge>
            </div>
          )}
          {metadata.execution_time !== undefined && (
            <div>
              <p className="text-muted-foreground text-sm font-medium">
                Execution Time
              </p>
              <p className="font-mono text-sm">
                {formatDuration(metadata.execution_time)}
              </p>
            </div>
          )}
          {metadata.tokens_used !== undefined && (
            <div>
              <p className="text-muted-foreground text-sm font-medium">
                Tokens Used
              </p>
              <p className="text-xl font-bold">
                {metadata.tokens_used.toLocaleString()}
              </p>
            </div>
          )}
        </div>

        {metadata.response_quality !== undefined && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Response Quality</span>
              <span>{metadata.response_quality.toFixed(2)}</span>
            </div>
            <Progress value={metadata.response_quality * 100} className="h-2" />
          </div>
        )}

        {metadata.response_target && (
          <div>
            <p className="text-muted-foreground text-sm font-medium">
              Response Target
            </p>
            <p className="font-mono text-sm">{metadata.response_target}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BatchMetadataCard({
  metadata,
}: {
  metadata: BatchEvaluationMetadata;
}) {
  const completionRate = metadata.total_evaluations
    ? ((metadata.completed_evaluations || 0) / metadata.total_evaluations) * 100
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Batch Processing
        </CardTitle>
        <CardDescription>
          Batch evaluation progress and statistics
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="text-center">
            <p className="text-xl font-bold">
              {metadata.total_evaluations || 0}
            </p>
            <p className="text-muted-foreground text-sm">Total</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-green-600">
              {metadata.completed_evaluations || 0}
            </p>
            <p className="text-muted-foreground text-sm">Completed</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-red-600">
              {metadata.failed_evaluations || 0}
            </p>
            <p className="text-muted-foreground text-sm">Failed</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-blue-600">
              {metadata.pending_evaluations || 0}
            </p>
            <p className="text-muted-foreground text-sm">Pending</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Completion Rate</span>
            <span>{completionRate.toFixed(1)}%</span>
          </div>
          <Progress value={completionRate} className="h-2" />
        </div>

        {metadata.average_score !== undefined && (
          <div className="grid grid-cols-3 gap-4 pt-2">
            <div className="text-center">
              <p className="text-lg font-bold">
                {metadata.average_score.toFixed(2)}
              </p>
              <p className="text-muted-foreground text-sm">Avg Score</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold">
                {metadata.min_score?.toFixed(2) || '-'}
              </p>
              <p className="text-muted-foreground text-sm">Min Score</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold">
                {metadata.max_score?.toFixed(2) || '-'}
              </p>
              <p className="text-muted-foreground text-sm">Max Score</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DirectMetadataCard({
  metadata,
}: {
  metadata: DirectEvaluationMetadata;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Direct Evaluation
        </CardTitle>
        <CardDescription>Direct evaluation performance metrics</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {metadata.input_length !== undefined && (
            <div>
              <p className="text-muted-foreground text-sm font-medium">
                Input Length
              </p>
              <p className="text-xl font-bold">
                {metadata.input_length.toLocaleString()}
              </p>
            </div>
          )}
          {metadata.output_length !== undefined && (
            <div>
              <p className="text-muted-foreground text-sm font-medium">
                Output Length
              </p>
              <p className="text-xl font-bold">
                {metadata.output_length.toLocaleString()}
              </p>
            </div>
          )}
          {metadata.evaluation_duration !== undefined && (
            <div>
              <p className="text-muted-foreground text-sm font-medium">
                Duration
              </p>
              <p className="font-mono text-sm">
                {formatDuration(metadata.evaluation_duration)}
              </p>
            </div>
          )}
          {metadata.model_used && (
            <div>
              <p className="text-muted-foreground text-sm font-medium">Model</p>
              <Badge variant="outline">{metadata.model_used}</Badge>
            </div>
          )}
        </div>

        {metadata.reasoning_quality !== undefined && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Reasoning Quality</span>
              <span>{metadata.reasoning_quality.toFixed(2)}</span>
            </div>
            <Progress
              value={metadata.reasoning_quality * 100}
              className="h-2"
            />
          </div>
        )}

        {metadata.confidence_score !== undefined && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Confidence Score</span>
              <span>{metadata.confidence_score.toFixed(2)}</span>
            </div>
            <Progress value={metadata.confidence_score * 100} className="h-2" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MetadataCardsComponent({
  metadata,
}: MetadataCardsComponentProps) {
  const cards = [];

  if (metadata.event_metadata) {
    cards.push(
      <EventMetadataCard key="event" metadata={metadata.event_metadata} />,
    );
  }

  if (metadata.baseline_metadata) {
    cards.push(
      <BaselineMetadataCard
        key="baseline"
        metadata={metadata.baseline_metadata}
      />,
    );
  }

  if (metadata.query_metadata) {
    cards.push(
      <QueryMetadataCard key="query" metadata={metadata.query_metadata} />,
    );
  }

  if (metadata.batch_metadata) {
    cards.push(
      <BatchMetadataCard key="batch" metadata={metadata.batch_metadata} />,
    );
  }

  if (metadata.direct_metadata) {
    cards.push(
      <DirectMetadataCard key="direct" metadata={metadata.direct_metadata} />,
    );
  }

  if (cards.length === 0) {
    return null;
  }

  return <div className="grid gap-6 md:grid-cols-2">{cards}</div>;
}
