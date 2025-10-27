'use client';

import { BarChart3, CheckCircle, XCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { CategoryBreakdown } from '@/lib/services/evaluations';

interface CategoryBreakdownComponentProps {
  categories: CategoryBreakdown[];
  title?: string;
  description?: string;
}

export function CategoryBreakdownComponent({
  categories,
  title = 'Category Performance',
  description = 'Breakdown of evaluation performance by category',
}: CategoryBreakdownComponentProps) {
  const totalWeight = categories.reduce(
    (sum, cat) => sum + (cat.weight || 1),
    0,
  );
  const weightedScore = categories.reduce((sum, cat) => {
    const weight = cat.weight || 1;
    const score = cat.score || 0;
    return sum + score * weight;
  }, 0);
  const averageScore = totalWeight > 0 ? weightedScore / totalWeight : 0;

  const passedCategories = categories.filter(cat => cat.passed === true).length;
  const failedCategories = categories.filter(
    cat => cat.passed === false,
  ).length;
  const totalCategories = categories.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Summary */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="text-center">
            <p className="text-2xl font-bold">{averageScore.toFixed(2)}</p>
            <p className="text-muted-foreground text-sm">Avg Score</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">
              {passedCategories}
            </p>
            <p className="text-muted-foreground text-sm">Passed</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-red-600">
              {failedCategories}
            </p>
            <p className="text-muted-foreground text-sm">Failed</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{totalCategories}</p>
            <p className="text-muted-foreground text-sm">Total</p>
          </div>
        </div>

        {/* Category Details */}
        <div className="space-y-4">
          <h4 className="font-medium">Category Details</h4>
          <div className="space-y-3">
            {categories.map((category, index) => (
              <div key={index} className="space-y-3 rounded-lg border p-4">
                {/* Category Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h5 className="font-medium">{category.category}</h5>
                    {category.passed !== undefined &&
                      (category.passed ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-600" />
                      ))}
                  </div>
                  <div className="flex items-center gap-2">
                    {category.score !== undefined && (
                      <Badge variant="outline">
                        {category.score.toFixed(2)}
                      </Badge>
                    )}
                    {category.weight !== undefined && category.weight !== 1 && (
                      <Badge variant="secondary">
                        Weight: {category.weight}
                      </Badge>
                    )}
                    {category.passed !== undefined && (
                      <Badge
                        variant={category.passed ? 'default' : 'destructive'}>
                        {category.passed ? 'PASS' : 'FAIL'}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Score Progress Bar */}
                {category.score !== undefined && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>Score</span>
                      <span>{category.score.toFixed(2)} / 1.00</span>
                    </div>
                    <Progress value={category.score * 100} className="h-2" />
                  </div>
                )}

                {/* Description */}
                {category.description && (
                  <p className="text-muted-foreground text-sm">
                    {category.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Weighted Score Summary */}
        {totalWeight > 1 && (
          <div className="bg-muted/50 rounded-lg p-4">
            <h4 className="mb-2 font-medium">Weighted Score Summary</h4>
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
