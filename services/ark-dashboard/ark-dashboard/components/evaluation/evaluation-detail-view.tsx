"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { 
  Play, 
  Square, 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  TrendingUp,
  Settings,
  FileText,
  BarChart3,
  Sparkles
} from "lucide-react"
import { toast } from "@/components/ui/use-toast"
import { evaluationsService } from "@/lib/services/evaluations"
import { useDelayedLoading } from "@/lib/hooks/use-delayed-loading"
import { EnhancedEvaluationDetailView } from "./enhanced-evaluation-detail-view"
import { EventMetricsDisplay } from "./event-metrics-display"
import type { components } from "@/lib/api/generated/types"

type EvaluationDetailResponse = components["schemas"]["EvaluationDetailResponse"]

interface EvaluationDetailViewProps {
  evaluationId: string
  namespace: string
  enhanced?: boolean
}

interface StatusBadgeProps {
  status: string
  onCancel?: () => void
}

const StatusBadge = ({ status, onCancel }: StatusBadgeProps) => {
  const getStatusInfo = () => {
    switch (status) {
      case "done":
        return { 
          color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", 
          icon: CheckCircle,
          label: "Completed"
        }
      case "error":
        return { 
          color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", 
          icon: AlertCircle,
          label: "Error"
        }
      case "running":
        return { 
          color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", 
          icon: Play,
          label: "Running"
        }
      case "evaluating":
        return { 
          color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200", 
          icon: BarChart3,
          label: "Evaluating"
        }
      case "canceled":
        return { 
          color: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200", 
          icon: Square,
          label: "Canceled"
        }
      default:
        return { 
          color: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200", 
          icon: Clock,
          label: "Unknown"
        }
    }
  }

  const { color, icon: Icon, label } = getStatusInfo()
  const canCancel = status === "running" || status === "evaluating"

  return (
    <div className="flex items-center gap-2">
      <Badge className={color}>
        <Icon className="w-3 h-3 mr-1" />
        {label}
      </Badge>
      {canCancel && onCancel && (
        <Button variant="outline" size="sm" onClick={onCancel}>
          <Square className="w-3 h-3 mr-1" />
          Cancel
        </Button>
      )}
    </div>
  )
}

export function EvaluationDetailView({ evaluationId, namespace, enhanced = false }: EvaluationDetailViewProps) {
  const [evaluation, setEvaluation] = useState<EvaluationDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [canceling, setCanceling] = useState(false)
  const [useEnhanced, setUseEnhanced] = useState(enhanced)
  const [enhancedAvailable, setEnhancedAvailable] = useState(false)
  const showLoading = useDelayedLoading(loading)

  useEffect(() => {
    const loadEvaluation = async () => {
      setLoading(true)
      try {
        const data = await evaluationsService.getDetailsByName(namespace, evaluationId)
        setEvaluation(data)
        
        // Check if enhanced data is available by trying to fetch it
        try {
          const enhancedData = await evaluationsService.getEnhancedDetailsByName(namespace, evaluationId)
          if (enhancedData?.enhanced_metadata) {
            setEnhancedAvailable(true)
          }
        } catch {
          // Enhanced data not available, continue with basic view
          setEnhancedAvailable(false)
        }
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Failed to Load Evaluation",
          description: error instanceof Error ? error.message : "An unexpected error occurred"
        })
      } finally {
        setLoading(false)
      }
    }

    loadEvaluation()
  }, [evaluationId, namespace])

  const handleCancel = async () => {
    if (!evaluation) return
    
    setCanceling(true)
    try {
      await evaluationsService.cancel(namespace, evaluation.name)
      toast({
        variant: "success",
        title: "Evaluation Canceled",
        description: "Successfully canceled the evaluation"
      })
      
      // Reload evaluation data
      const data = await evaluationsService.getDetailsByName(namespace, evaluationId)
      setEvaluation(data)
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to Cancel Evaluation", 
        description: error instanceof Error ? error.message : "An unexpected error occurred"
      })
    } finally {
      setCanceling(false)
    }
  }

  // If enhanced mode is requested, use the enhanced component
  if (useEnhanced) {
    return <EnhancedEvaluationDetailView evaluationId={evaluationId} namespace={namespace} />
  }

  if (showLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading evaluation details...</div>
      </div>
    )
  }

  if (!evaluation) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-2 text-sm font-semibold text-foreground">Evaluation not found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            The evaluation &quot;{evaluationId}&quot; could not be found.
          </p>
        </div>
      </div>
    )
  }

  const spec = evaluation.spec as Record<string, unknown>
  const status = evaluation.status as Record<string, unknown>
  const evaluationMetadata = evaluation.metadata as Record<string, unknown>
  const annotations = evaluationMetadata?.annotations as Record<string, unknown> || {}
  
  // Extract evaluation metadata from annotations
  const metadata: Record<string, unknown> = {}
  Object.entries(annotations).forEach(([key, value]) => {
    if (key.startsWith('evaluation.metadata/')) {
      const metadataKey = key.replace('evaluation.metadata/', '')
      // Parse JSON strings if needed
      if (typeof value === 'string' && (value.startsWith('[') || value.startsWith('{'))) {
        try {
          metadata[metadataKey] = JSON.parse(value)
        } catch {
          metadata[metadataKey] = value
        }
      } else {
        metadata[metadataKey] = value
      }
    }
  })

  const evaluatorInfo = spec?.evaluator as { name?: string; parameters?: Array<{ name: string; value: string }> }
  const config = spec?.config as Record<string, unknown>
  const queryRef = config?.queryRef as { name?: string }
  const message = status?.message as string | undefined
  const hasMetadata = metadata && typeof metadata === 'object' && Object.keys(metadata).length > 0
  const reasoning = metadata?.reasoning as string | undefined
  
  // Check if this is an event evaluation
  const evaluationType = spec?.type as string || "unknown"
  const isEventEvaluation = evaluationType === "event" || 
    metadata?.rule_results || 
    metadata?.total_rules !== undefined ||
    metadata?.events_analyzed !== undefined
  
  // Debug logging for development
  if (process.env.NODE_ENV === 'development') {
    console.log('EvaluationDetailView - metadata:', metadata)
    console.log('EvaluationDetailView - rule_results type:', typeof metadata?.rule_results)
    console.log('EvaluationDetailView - rule_results value:', metadata?.rule_results)
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{evaluation.name}</h1>
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
              className="flex items-center gap-2"
            >
              <Sparkles className="w-3 h-3" />
              Enhanced View
            </Button>
          )}
          <StatusBadge 
            status={status?.phase as string || "unknown"} 
            onCancel={canceling ? undefined : handleCancel}
          />
        </div>
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
                <p className="text-sm font-medium text-muted-foreground">Type</p>
                <Badge variant="outline">{spec?.type as string || "unknown"}</Badge>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Score</p>
                <p className="text-2xl font-bold">
                  {status?.score ? Number(status.score).toFixed(2) : "-"}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Passed</p>
                <div className="flex items-center gap-1">
                  {status?.passed === true ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : status?.passed === false ? (
                    <AlertCircle className="h-4 w-4 text-red-600" />
                  ) : null}
                  <span className={`font-medium ${
                    status?.passed === true 
                      ? "text-green-600" 
                      : status?.passed === false 
                        ? "text-red-600" 
                        : "text-muted-foreground"
                  }`}>
                    {status?.passed === true ? "Yes" : status?.passed === false ? "No" : "Unknown"}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Phase</p>
                <p className="font-medium capitalize">{status?.phase as string || "unknown"}</p>
              </div>
            </div>
            
            {message && (
              <>
                <Separator />
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Message</p>
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
              <p className="text-sm font-medium text-muted-foreground">Evaluator</p>
              <p className="font-medium">{evaluatorInfo?.name || "-"}</p>
            </div>
            
            {queryRef?.name && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Query Reference</p>
                <p className="font-medium">{queryRef.name}</p>
              </div>
            )}

            {evaluatorInfo?.parameters && evaluatorInfo.parameters.length > 0 && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Parameters</p>
                <div className="space-y-2">
                  {evaluatorInfo.parameters.map((param, index) => (
                    <div key={index} className="flex justify-between items-center text-sm">
                      <span className="font-medium">{param.name}:</span>
                      <span className="text-muted-foreground font-mono">{param.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Metrics Display - Use EventMetricsDisplay for event evaluations */}
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
              const flattenedRules: { [key: string]: { rule_name: string; index: number; passed?: boolean; weight?: number } } = {};
              Object.entries(metadata).forEach(([key, value]) => {
                const match = key.match(/^rule_(\d+)_(.+)_(passed|weight)$/);
                if (match) {
                  const [, ruleIndex, ruleName, attribute] = match;
                  const ruleKey = `${ruleIndex}_${ruleName}`;
                  if (!flattenedRules[ruleKey]) {
                    flattenedRules[ruleKey] = {
                      rule_name: ruleName.replace(/_/g, ' '),
                      index: parseInt(ruleIndex)
                    };
                  }
                  if (attribute === 'passed') {
                    flattenedRules[ruleKey].passed = value === 'True' || value === true;
                  } else if (attribute === 'weight') {
                    flattenedRules[ruleKey].weight = typeof value === 'string' ? parseFloat(value) : (typeof value === 'number' ? value : undefined);
                  }
                }
              });
              
              // Convert to array format
              return Object.values(flattenedRules).sort((a, b) => a.index - b.index);
            })(),
            weighted_score: metadata.weighted_score as number | undefined,
            total_weight: metadata.total_weight as number | undefined,
            min_score_threshold: metadata.min_score_threshold as number | undefined,
            events_analyzed: metadata.events_analyzed as number | undefined,
            query_name: metadata.query_name as string | undefined,
            session_id: metadata.session_id as string | undefined
          }}
          queryName={queryRef?.name}
          evaluationSpec={spec}
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
              {Object.keys(metadata).filter(key => !key.toLowerCase().includes('reasoning')).map((key) => {
                const value = metadata[key]
                return <div key={key}>
                  <p className="text-sm font-medium text-muted-foreground capitalize">
                    {key.replace(/_/g, " ")}
                  </p>
                  <p className="font-mono text-sm">
                    {typeof value === "string" ? value : JSON.stringify(value)}
                  </p>
                </div>
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

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
    </div>
  )
}