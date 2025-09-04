"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { toast } from "@/components/ui/use-toast"
import {
  evaluatorsService,
  evaluationsService,
  queriesService,
  agentsService,
  teamsService,
  modelsService,
  type Evaluation,
  type Evaluator,
  type Agent,
  type Team,
  type Model
} from "@/lib/services"
import type { components } from "@/lib/api/generated/types"

type EvaluationCreateRequest = components["schemas"]["EvaluationCreateRequest"]
type EvaluationUpdateRequest = components["schemas"]["EvaluationUpdateRequest"]
type EvaluationType = components["schemas"]["EvaluationType"]
type QueryResponse = components["schemas"]["QueryResponse"]

interface EvaluationEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  evaluation: Evaluation | null
  onSave: (
    evaluation: (EvaluationCreateRequest | EvaluationUpdateRequest) & { id?: string }
  ) => void
  namespace: string
  initialEvaluator?: string
  initialQueryRef?: string
}

export function EvaluationEditor({
  open,
  onOpenChange,
  evaluation,
  onSave,
  namespace,
  initialEvaluator,
  initialQueryRef
}: EvaluationEditorProps) {
  const [name, setName] = useState("")
  const [mode, setMode] = useState<EvaluationType>("direct")
  const [evaluatorRef, setEvaluatorRef] = useState("")
  const [queryRef, setQueryRef] = useState("")
  const [input, setInput] = useState("")
  const [output, setOutput] = useState("")
  const [evaluators, setEvaluators] = useState<Evaluator[]>([])
  const [queries, setQueries] = useState<QueryResponse[]>([])
  const [targetType, setTargetType] = useState<"agent" | "team" | "model">("agent")
  const [targetRef, setTargetRef] = useState("")
  const [agents, setAgents] = useState<Agent[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [models, setModels] = useState<Model[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [evaluatorsLoading, setEvaluatorsLoading] = useState(false)
  const [queriesLoading, setQueriesLoading] = useState(false)
  const [targetsLoading, setTargetsLoading] = useState(false)
  const isEditing = !!evaluation


  const safe = <T,>(requestName: string, p: Promise<T>, fallback: T): Promise<T> => {
    return p.catch((err) => {
      console.error(`${requestName} failed:`, err);
      return fallback;
    });
  } 

  useEffect(() => {
    if (open) {
      const loadData = async () => {
        setEvaluatorsLoading(true)
        setQueriesLoading(true)
        setTargetsLoading(true)
        
        try {
          const [evaluatorsData, queriesData, agentsData, teamsData, modelsData] = await Promise.all([
            safe("evaluatorsGetAll", evaluatorsService.getAll(namespace), []),
            safe("queriesGetAll", queriesService.list(namespace), { items: [], count: 0 }),
            safe("agentsGetAll", agentsService.getAll(namespace), []),
            safe("teamsGetAll", teamsService.getAll(namespace), []),
            safe("modelsGetAll", modelsService.getAll(namespace), [])
          ])
          setEvaluators(evaluatorsData)
          setQueries(queriesData.items)
          setAgents(agentsData)
          setTeams(teamsData)
          setModels(modelsData)
        } catch (error) {
          toast({
            variant: "destructive",
            title: "Failed to Load Data",
            description: error instanceof Error ? error.message : "An unexpected error occurred"
          })
        } finally {
          setEvaluatorsLoading(false)
          setQueriesLoading(false)
          setTargetsLoading(false)
        }
      }
      loadData()
    }
  }, [open, namespace])

  useEffect(() => {
    const loadEvaluationDetails = async () => {
      if (evaluation && isEditing) {
        try {
          // Fetch detailed evaluation data with spec
          const detailedEvaluation = await evaluationsService.getDetailsByName(namespace, evaluation.name)
          if (detailedEvaluation) {
            setName(detailedEvaluation.name)
            setMode((detailedEvaluation.spec?.mode as EvaluationType) || "direct")
            
            // Extract evaluator reference
            const evaluatorSpec = detailedEvaluation.spec?.evaluator as { name?: string }
            setEvaluatorRef(evaluatorSpec?.name || "")
            
            // Extract query reference
            const queryRefSpec = detailedEvaluation.spec?.queryRef as { name?: string }
            setQueryRef(queryRefSpec?.name || "")
            
            // Extract input and output
            setInput((detailedEvaluation.spec?.input as string) || "")
            setOutput((detailedEvaluation.spec?.output as string) || "")
          }
        } catch (error) {
          toast({
            variant: "destructive",
            title: "Failed to Load Evaluation Details",
            description: error instanceof Error ? error.message : "An unexpected error occurred"
          })
          // Fallback to basic data
          setName(evaluation.name)
          setMode((evaluation.type as EvaluationType) || "direct")
          setEvaluatorRef("")
          setQueryRef("")
          setInput("")
          setOutput("")
        }
      } else if (!evaluation) {
        // Clear form for new evaluation or set initial values
        setName("")
        setMode(initialQueryRef ? "query" : "direct")
        setEvaluatorRef(initialEvaluator || "")
        setQueryRef(initialQueryRef || "")
        setInput("")
        setOutput("")
        setTargetType("agent")
        setTargetRef("")
      }
    }

    if (open) {
      loadEvaluationDetails()
    }
  }, [evaluation, isEditing, namespace, open, initialEvaluator, initialQueryRef])

  const handleSubmit = async () => {
    if (!evaluatorRef) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please select an evaluator"
      })
      return
    }

    // Validate name format for new evaluations
    if (!isEditing && name) {
      if (!name.match(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/)) {
        toast({
          variant: "destructive",
          title: "Validation Error",
          description: "Name must be a valid Kubernetes name (lowercase letters, numbers, and hyphens only)"
        })
        return
      }
    }

    // Validate query mode requirements
    if ((mode === "query" || mode === "batch") && !queryRef) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Query reference is required for query and batch modes"
      })
      return
    }

    // Validate target selection for query mode
    if ((mode === "query" || mode === "batch") && !targetRef) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Target selection is required for query and batch modes"
      })
      return
    }

    // Validate direct mode requirements
    if (mode === "direct" && (!input || !output)) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Input and output are required for direct mode"
      })
      return
    }

    setIsSubmitting(true)
    try {
      const evaluationData = {
        name,
        type: mode,
        config: {
          ...(input && { input }),
          ...(output && { output }),
          ...(queryRef && {
            queryRef: {
              name: queryRef,
              namespace,
              ...(targetRef && { responseTarget: `${targetType}:${targetRef}` })
            }
          })
        },
        evaluator: {
          name: evaluatorRef,
          namespace
        },
        ...(isEditing && { id: evaluation.name })
      }

      onSave(evaluationData)
      onOpenChange(false)
      if (!isEditing) {
        setName("")
        setMode("direct")
        setEvaluatorRef("")
        setQueryRef("")
        setInput("")
        setOutput("")
        setTargetType("agent")
        setTargetRef("")
      }
    } catch {
      // Error handling is done in the calling component via onSave callback
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Evaluation" : "Create New Evaluation"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the evaluation configuration."
              : "Create a new evaluation to assess performance."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          <div className="space-y-2 flex flex-col">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="evaluation-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isEditing}
            />
          </div>

          <div className="space-y-2 flex flex-col">
            <Label htmlFor="mode">Type</Label>
            <Select value={mode} onValueChange={(value) => setMode(value as EvaluationType)}>
              <SelectTrigger>
                <SelectValue placeholder="Select evaluation mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="direct">Direct</SelectItem>
                <SelectItem value="query">Query</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 flex flex-col">
            <Label htmlFor="evaluator">Evaluator *</Label>
            <Select value={evaluatorRef} onValueChange={setEvaluatorRef}>
              <SelectTrigger>
                <SelectValue placeholder="Select an evaluator" />
              </SelectTrigger>
              <SelectContent>
                {evaluatorsLoading ? (
                  <SelectItem value="__loading__" disabled>
                    Loading evaluators...
                  </SelectItem>
                ) : (
                  evaluators.map((evaluator) => (
                    <SelectItem key={evaluator.name} value={evaluator.name}>
                      {evaluator.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {(mode === "query" || mode === "batch") && (
            <div className="space-y-2 flex flex-col">
              <Label htmlFor="query">Query Reference</Label>
              <Select value={queryRef || "__none__"} onValueChange={(value) => setQueryRef(value === "__none__" ? "" : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a query (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    <span className="text-muted-foreground">None</span>
                  </SelectItem>
                  {queriesLoading ? (
                    <SelectItem value="__loading__" disabled>
                      Loading queries...
                    </SelectItem>
                  ) : (
                    queries.map((query) => (
                      <SelectItem key={query.name} value={query.name}>
                        {query.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {(mode === "query" || mode === "batch") && (
            <div className="space-y-4">
              <div className="space-y-2 flex flex-col">
                <Label htmlFor="targetType">Target Type</Label>
                <Select value={targetType} onValueChange={(value: "agent" | "team" | "model") => {
                  setTargetType(value)
                  setTargetRef("") // Reset target ref when type changes
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select target type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agent">Agent</SelectItem>
                    <SelectItem value="team">Team</SelectItem>
                    <SelectItem value="model">Model</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 flex flex-col">
                <Label htmlFor="targetRef">Target</Label>
                <Select value={targetRef || "__none__"} onValueChange={(value) => setTargetRef(value === "__none__" ? "" : value)}>
                  <SelectTrigger>
                    <SelectValue placeholder={`Select a ${targetType}`} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      <span className="text-muted-foreground">None</span>
                    </SelectItem>
                    {targetsLoading ? (
                      <SelectItem value="__loading__" disabled>
                        Loading {targetType}s...
                      </SelectItem>
                    ) : (
                      <>
                        {targetType === "agent" && agents.map((agent) => (
                          <SelectItem key={agent.name} value={agent.name}>
                            {agent.name}
                          </SelectItem>
                        ))}
                        {targetType === "team" && teams.map((team) => (
                          <SelectItem key={team.name} value={team.name}>
                            {team.name}
                          </SelectItem>
                        ))}
                        {targetType === "model" && models.map((model) => (
                          <SelectItem key={model.name} value={model.name}>
                            {model.name}
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {mode === "direct" && (
            <>
              <div className="space-y-2 flex flex-col">
                <Label htmlFor="input">Input</Label>
                <Textarea
                  id="input"
                  placeholder="Input data for evaluation..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-2 flex flex-col">
                <Label htmlFor="output">Output</Label>
                <Textarea
                  id="output"
                  placeholder="Expected output or actual output to evaluate..."
                  value={output}
                  onChange={(e) => setOutput(e.target.value)}
                  rows={3}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting || !name || !evaluatorRef || 
              ((mode === "query" || mode === "batch") && (!queryRef || !targetRef))}
          >
            {isSubmitting
              ? "Saving..."
              : isEditing
              ? "Update Evaluation"
              : "Create Evaluation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}