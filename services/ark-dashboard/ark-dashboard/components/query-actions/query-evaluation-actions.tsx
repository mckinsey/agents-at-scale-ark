"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip"
import {
  Plus,
  BarChart3,
  ExternalLink,
  ChevronDown,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle
} from "lucide-react"
import { useRouter } from "next/navigation"
import { evaluationsService, evaluatorsService, type QueryEvaluationSummary, type Evaluator } from "@/lib/services"
import { EvaluationEditor } from "@/components/editors"
import type { components } from "@/lib/api/generated/types"

type EvaluationCreateRequest = components["schemas"]["EvaluationCreateRequest"]
type EvaluationUpdateRequest = components["schemas"]["EvaluationUpdateRequest"]

interface QueryEvaluationActionsProps {
  queryName: string
  namespace: string
}

const getStatusConfig = (status: QueryEvaluationSummary['status']) => {
  switch (status) {
    case 'all-passed':
      return { icon: CheckCircle, color: 'text-green-600', label: 'All Passed' }
    case 'all-failed':
      return { icon: XCircle, color: 'text-red-600', label: 'All Failed' }
    case 'mixed':
      return { icon: AlertTriangle, color: 'text-yellow-600', label: 'Mixed Results' }
    case 'pending':
      return { icon: Clock, color: 'text-blue-600', label: 'In Progress' }
    default:
      return { icon: BarChart3, color: 'text-gray-400', label: 'No Evaluations' }
  }
}

export function QueryEvaluationActions({ queryName, namespace }: QueryEvaluationActionsProps) {
  const [summary, setSummary] = useState<QueryEvaluationSummary | null>(null)
  const [evaluators, setEvaluators] = useState<Evaluator[]>([])
  const [loading, setLoading] = useState(true)
  const [editorOpen, setEditorOpen] = useState(false)
  const [selectedEvaluator, setSelectedEvaluator] = useState<string>("")
  const router = useRouter()

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const [summaryData, evaluatorsData] = await Promise.all([
          evaluationsService.getEvaluationSummary(namespace, queryName),
          evaluatorsService.getAll(namespace)
        ])
        setSummary(summaryData)
        setEvaluators(evaluatorsData)
      } catch {
        // Silently fail - UI will show loading state or empty state
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [queryName, namespace])

  const handleViewEvaluations = () => {
    router.push(`/evaluations?namespace=${namespace}&query=${encodeURIComponent(queryName)}`)
  }

  const handleCreateEvaluation = (evaluatorName?: string) => {
    if (evaluatorName) {
      setSelectedEvaluator(evaluatorName)
    }
    setEditorOpen(true)
  }

  const handleSaveEvaluation = async (evaluationData: (EvaluationCreateRequest | EvaluationUpdateRequest) & { id?: string }) => {
    try {
      // Create the evaluation
      const createRequest = evaluationData as EvaluationCreateRequest
      await evaluationsService.create(namespace, createRequest)
      
      // Refresh the summary after save
      const newSummary = await evaluationsService.getEvaluationSummary(namespace, queryName)
      setSummary(newSummary)
    } catch (error) {
      throw error // Re-throw so EvaluationEditor can handle the error display
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 animate-pulse bg-gray-200 rounded-full" />
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    )
  }

  const statusConfig = getStatusConfig(summary?.status || 'none')
  const StatusIcon = statusConfig.icon

  return (
    <div className="flex items-center gap-2">
      {/* Evaluation Summary Badge */}
      {summary && summary.total > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleViewEvaluations}
                className="h-8 gap-2 px-3"
              >
                <StatusIcon className={`w-4 h-4 ${statusConfig.color}`} />
                <span className="text-sm font-medium">{summary.total}</span>
                <Badge variant="secondary" className="text-xs">
                  {summary.passed}✓ {summary.failed}✗
                </Badge>
                <ExternalLink className="w-3 h-3 opacity-60" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-xs">
                <p className="font-medium">{statusConfig.label}</p>
                <p>Total: {summary.total} evaluations</p>
                {summary.passed > 0 && <p className="text-green-600">✓ Passed: {summary.passed}</p>}
                {summary.failed > 0 && <p className="text-red-600">✗ Failed: {summary.failed}</p>}
                {summary.pending > 0 && <p className="text-blue-600">⏳ Pending: {summary.pending}</p>}
                <p className="mt-1 opacity-75">Click to view all evaluations</p>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* View Evaluations Button (when no evaluations exist) */}
      {(!summary || summary.total === 0) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleViewEvaluations}
          className="h-8 gap-2 px-3 text-muted-foreground"
        >
          <BarChart3 className="w-4 h-4" />
          <span className="text-sm">No Evaluations</span>
          <ExternalLink className="w-3 h-3 opacity-60" />
        </Button>
      )}

      {/* Create Evaluation Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1">
            <Plus className="w-4 h-4" />
            New Evaluation
            <ChevronDown className="w-3 h-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => handleCreateEvaluation()}>
            <Plus className="w-4 h-4 mr-2" />
            Create Custom Evaluation
          </DropdownMenuItem>
          
          {evaluators.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                Quick Start with Evaluator:
              </div>
              {evaluators.slice(0, 5).map((evaluator) => (
                <DropdownMenuItem
                  key={evaluator.name}
                  onClick={() => handleCreateEvaluation(evaluator.name)}
                  className="text-xs"
                >
                  <BarChart3 className="w-3 h-3 mr-2" />
                  {evaluator.name}
                </DropdownMenuItem>
              ))}
              {evaluators.length > 5 && (
                <DropdownMenuItem onClick={() => handleCreateEvaluation()}>
                  <Plus className="w-3 h-3 mr-2" />
                  More evaluators...
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Evaluation Editor */}
      <EvaluationEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        evaluation={null}
        onSave={handleSaveEvaluation}
        namespace={namespace}
        initialEvaluator={selectedEvaluator}
        initialQueryRef={queryName}
      />
    </div>
  )
}