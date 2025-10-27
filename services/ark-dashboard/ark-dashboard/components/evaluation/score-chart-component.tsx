'use client';

import { Minus, TrendingDown, TrendingUp } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface ScoreDataPoint {
  label: string;
  score: number;
  passed?: boolean;
  weight?: number;
  color?: string;
}

interface ScoreChartComponentProps {
  title: string;
  description?: string;
  data: ScoreDataPoint[];
  showTrend?: boolean;
  maxScore?: number;
}

export function ScoreChartComponent({
  title,
  description,
  data,
  showTrend = false,
  maxScore = 1.0,
}: ScoreChartComponentProps) {
  if (data.length === 0) {
    return null;
  }

  // Calculate overall statistics
  const totalWeight = data.reduce((sum, item) => sum + (item.weight || 1), 0);
  const weightedScore = data.reduce((sum, item) => {
    const weight = item.weight || 1;
    return sum + item.score * weight;
  }, 0);
  const averageScore = totalWeight > 0 ? weightedScore / totalWeight : 0;
  const passedCount = data.filter(item => item.passed === true).length;
  const failedCount = data.filter(item => item.passed === false).length;

  // Calculate trend if we have multiple data points
  let trend: 'up' | 'down' | 'neutral' | null = null;
  if (showTrend && data.length >= 2) {
    const firstScore = data[0].score;
    const lastScore = data[data.length - 1].score;
    const difference = lastScore - firstScore;

    if (Math.abs(difference) < 0.01) {
      trend = 'neutral';
    } else if (difference > 0) {
      trend = 'up';
    } else {
      trend = 'down';
    }
  }

  const getTrendIcon = (trendDirection: 'up' | 'down' | 'neutral') => {
    switch (trendDirection) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'down':
        return <TrendingDown className="h-4 w-4 text-red-600" />;
      case 'neutral':
        return <Minus className="h-4 w-4 text-gray-600" />;
      default:
        return null;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{title}</span>
          {trend && getTrendIcon(trend)}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary Statistics */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="text-center">
            <p className="text-2xl font-bold">{averageScore.toFixed(2)}</p>
            <p className="text-muted-foreground text-sm">Average</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{data.length}</p>
            <p className="text-muted-foreground text-sm">Total</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">{passedCount}</p>
            <p className="text-muted-foreground text-sm">Passed</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-red-600">{failedCount}</p>
            <p className="text-muted-foreground text-sm">Failed</p>
          </div>
        </div>

        {/* Overall Score Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Overall Score</span>
            <span>
              {averageScore.toFixed(2)} / {maxScore.toFixed(2)}
            </span>
          </div>
          <Progress value={(averageScore / maxScore) * 100} className="h-3" />
        </div>

        {/* Individual Score Bars */}
        <div className="space-y-3">
          <h4 className="font-medium">Breakdown</h4>
          <div className="space-y-2">
            {data.map((item, index) => (
              <div key={index} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{item.label}</span>
                    {item.passed !== undefined && (
                      <Badge
                        variant={item.passed ? 'default' : 'destructive'}
                        className="text-xs">
                        {item.passed ? 'PASS' : 'FAIL'}
                      </Badge>
                    )}
                    {item.weight !== undefined && item.weight !== 1 && (
                      <Badge variant="outline" className="text-xs">
                        Weight: {item.weight}
                      </Badge>
                    )}
                  </div>
                  <span className="font-mono">
                    {item.score.toFixed(2)} / {maxScore.toFixed(2)}
                  </span>
                </div>
                <div className="relative">
                  <Progress
                    value={(item.score / maxScore) * 100}
                    className="h-2"
                  />
                  {item.color && (
                    <div
                      className="absolute inset-0 rounded-full opacity-75"
                      style={{ backgroundColor: item.color }}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Weighted Score Summary (if applicable) */}
        {totalWeight > data.length && (
          <div className="bg-muted/50 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Weighted Summary</h4>
            <div className="flex items-center justify-between">
              <span>Total Weighted Score</span>
              <span className="text-lg font-bold">
                {weightedScore.toFixed(2)} / {totalWeight.toFixed(2)}
              </span>
            </div>
            <div className="mt-2">
              <Progress
                value={(weightedScore / totalWeight) * 100}
                className="h-2"
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
