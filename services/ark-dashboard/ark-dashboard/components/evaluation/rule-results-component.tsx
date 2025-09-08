"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { CheckCircle, XCircle, AlertCircle } from "lucide-react"
import { EventEvaluationMetadata } from "@/lib/services/evaluations"

interface RuleResultsComponentProps {
  eventMetadata: EventEvaluationMetadata
}

export function RuleResultsComponent({ eventMetadata }: RuleResultsComponentProps) {
  const { 
    total_rules, 
    passed_rules, 
    failed_rules, 
    rule_results,
    weighted_score,
    total_weight 
  } = eventMetadata

  const passRate = total_rules ? (passed_rules || 0) / total_rules * 100 : 0

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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">{passed_rules || 0}</p>
            <p className="text-sm text-muted-foreground">Passed</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-red-600">{failed_rules || 0}</p>
            <p className="text-sm text-muted-foreground">Failed</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{total_rules || 0}</p>
            <p className="text-sm text-muted-foreground">Total Rules</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{passRate.toFixed(1)}%</p>
            <p className="text-sm text-muted-foreground">Pass Rate</p>
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
          <div className="bg-muted/50 p-4 rounded-lg">
            <div className="flex justify-between items-center">
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
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {rule.passed ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600" />
                    )}
                    <div>
                      <p className="font-medium">{rule.rule_name}</p>
                      {rule.reasoning && (
                        <p className="text-sm text-muted-foreground">{rule.reasoning}</p>
                      )}
                      {rule.error && (
                        <p className="text-sm text-red-600 flex items-center gap-1">
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
                      <Badge variant="secondary">
                        Weight: {rule.weight}
                      </Badge>
                    )}
                    <Badge variant={rule.passed ? "default" : "destructive"}>
                      {rule.passed ? "PASS" : "FAIL"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}