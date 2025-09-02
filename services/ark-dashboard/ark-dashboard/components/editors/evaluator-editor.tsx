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
import { X, Plus } from "lucide-react"
import { toast } from "@/components/ui/use-toast"
import {
  modelsService,
  evaluatorsService,
  type Evaluator,
  type EvaluatorCreateRequest,
  type EvaluatorUpdateRequest,
  type Model
} from "@/lib/services"

interface Parameter {
  name: string
  value: string
}

interface MatchExpression {
  key: string
  operator: string
  values: string[]
}

interface Selector {
  resource: string
  labelSelector?: {
    matchLabels?: Record<string, string>
    matchExpressions?: MatchExpression[]
  }
}

interface EvaluatorEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  evaluator: Evaluator | null
  onSave: (
    evaluator: (EvaluatorCreateRequest | EvaluatorUpdateRequest) & { id?: string }
  ) => void
  namespace: string
}

export function EvaluatorEditor({
  open,
  onOpenChange,
  evaluator,
  onSave,
  namespace
}: EvaluatorEditorProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [address, setAddress] = useState("")
  const [modelRef, setModelRef] = useState("")
  const [parameters, setParameters] = useState<Parameter[]>([])
  const [selector, setSelector] = useState<Selector | null>(null)
  const [models, setModels] = useState<Model[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [evaluatorLoading, setEvaluatorLoading] = useState(false)
  const isEditing = !!evaluator

  useEffect(() => {
    if (open) {
      const loadModels = async () => {
        setModelsLoading(true)
        try {
          const modelsData = await modelsService.getAll(namespace)
          setModels(modelsData)
        } catch (error) {
          toast({
            variant: "destructive",
            title: "Failed to Load Models",
            description: error instanceof Error ? error.message : "An unexpected error occurred"
          })
        } finally {
          setModelsLoading(false)
        }
      }
      loadModels()
    }
  }, [open, namespace])

  useEffect(() => {
    const loadEvaluatorDetails = async () => {
      if (evaluator && isEditing) {
        setEvaluatorLoading(true)
        try {
          // Fetch detailed evaluator data with spec
          const detailedEvaluator = await evaluatorsService.getDetailsByName(namespace, evaluator.name)
          if (detailedEvaluator) {
            setName(detailedEvaluator.name)
            setDescription(detailedEvaluator.spec?.description as string || "")
            
            // Extract address from spec
            const addressSpec = detailedEvaluator.spec?.address as { value?: string }
            setAddress(addressSpec?.value || "")
            
            // Extract model reference
            const modelRefSpec = detailedEvaluator.spec?.modelRef as { name?: string }
            setModelRef(modelRefSpec?.name || "")
            
            // Extract parameters
            const parametersSpec = detailedEvaluator.spec?.parameters as Parameter[]
            setParameters(parametersSpec || [])
            
            // Extract selector - handle both flat and nested structures
            const selectorSpec = detailedEvaluator.spec?.selector as Record<string, unknown>
            if (selectorSpec) {
              // Check if it's the flat Kubernetes structure
              if (selectorSpec.resourceType && selectorSpec.matchLabels !== undefined) {
                setSelector({
                  resource: selectorSpec.resourceType as string,
                  labelSelector: {
                    matchLabels: (selectorSpec.matchLabels as Record<string, string>) || {},
                    matchExpressions: (selectorSpec.matchExpressions as MatchExpression[]) || []
                  }
                })
              } else if (selectorSpec.resource) {
                // It's already in the nested API structure
                setSelector(selectorSpec as unknown as Selector)
              } else {
                setSelector(null)
              }
            } else {
              setSelector(null)
            }
          }
        } catch (error) {
          toast({
            variant: "destructive",
            title: "Failed to Load Evaluator Details",
            description: error instanceof Error ? error.message : "An unexpected error occurred"
          })
          // Fallback to basic data
          setName(evaluator.name)
          setDescription(evaluator.description || "")
          setAddress(evaluator.address || "")
          setModelRef("")
          setParameters([])
          setSelector(null)
        } finally {
          setEvaluatorLoading(false)
        }
      } else if (!evaluator) {
        // Clear form for new evaluator
        setName("")
        setDescription("")
        setAddress("")
        setModelRef("")
        setParameters([])
        setSelector(null)
      }
    }

    if (open) {
      loadEvaluatorDetails()
    }
  }, [evaluator, isEditing, namespace, open])

  const addParameter = () => {
    setParameters([...parameters, { name: "", value: "" }])
  }

  const removeParameter = (index: number) => {
    setParameters(parameters.filter((_, i) => i !== index))
  }

  const updateParameter = (index: number, field: "name" | "value", value: string) => {
    const updated = [...parameters]
    updated[index][field] = value
    setParameters(updated)
  }

  const addMatchLabel = () => {
    if (!selector) {
      setSelector({
        resource: "Query",
        labelSelector: {
          matchLabels: { "": "" },
          matchExpressions: []
        }
      })
    } else {
      setSelector({
        ...selector,
        labelSelector: {
          ...selector.labelSelector,
          matchLabels: { ...selector.labelSelector?.matchLabels, "": "" }
        }
      })
    }
  }

  const removeMatchLabel = (key: string) => {
    if (selector?.labelSelector?.matchLabels) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [key]: _removed, ...rest } = selector.labelSelector.matchLabels
      setSelector({ 
        ...selector, 
        labelSelector: {
          ...selector.labelSelector,
          matchLabels: rest
        }
      })
    }
  }

  const updateMatchLabel = (oldKey: string, newKey: string, value: string) => {
    if (selector?.labelSelector?.matchLabels) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [oldKey]: _removed, ...rest } = selector.labelSelector.matchLabels
      setSelector({
        ...selector,
        labelSelector: {
          ...selector.labelSelector,
          matchLabels: { ...rest, [newKey]: value }
        }
      })
    }
  }

  const handleSubmit = async () => {
    // Validation
    if (!name || !address) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Name and address are required fields"
      })
      return
    }

    // Validate Kubernetes name format
    if (!name.match(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/)) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Name must be a valid Kubernetes name (lowercase letters, numbers, and hyphens only)"
      })
      return
    }

    // Validate URL format
    try {
      new URL(address)
    } catch {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Address must be a valid URL"
      })
      return
    }

    // Validate parameters don't have duplicates
    const paramNames = new Set()
    for (const param of parameters) {
      if (!param.name || !param.name.trim()) {
        toast({
          variant: "destructive",
          title: "Validation Error",
          description: "All parameters must have names"
        })
        return
      }
      if (paramNames.has(param.name)) {
        toast({
          variant: "destructive",
          title: "Validation Error",
          description: `Duplicate parameter name: ${param.name}`
        })
        return
      }
      paramNames.add(param.name)
    }

    // Validate selector labels don't have empty keys
    if (selector?.labelSelector?.matchLabels) {
      for (const [key] of Object.entries(selector.labelSelector.matchLabels)) {
        if (!key.trim()) {
          toast({
            variant: "destructive",
            title: "Validation Error",
            description: "Selector labels cannot have empty keys"
          })
          return
        }
      }
    }

    setIsSubmitting(true)
    try {
      const evaluatorData = {
        name,
        description: description || undefined,
        address: {
          value: address
        },
        ...(modelRef && { modelRef: { name: modelRef } }),
        ...(parameters.length > 0 && { parameters }),
        ...(selector && selector.labelSelector && Object.keys(selector.labelSelector.matchLabels || {}).some(k => k && selector.labelSelector?.matchLabels?.[k]) && { selector }),
        ...(isEditing && { id: evaluator.name })
      }

      onSave(evaluatorData)
      onOpenChange(false)
      if (!isEditing) {
        setName("")
        setDescription("")
        setAddress("")
        setModelRef("")
        setParameters([])
        setSelector(null)
      }
    } catch {
      // Error handling is done in the calling component via onSave callback
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Evaluator" : "Create New Evaluator"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the evaluator configuration."
              : "Create a new evaluator to assess agent performance."}
          </DialogDescription>
        </DialogHeader>

        {evaluatorLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Loading evaluator details...</div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="evaluator-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isEditing}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Describe what this evaluator does..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              placeholder="http://evaluator-service:8080"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="model">Model Reference (Optional)</Label>
            <Select value={modelRef || "__none__"} onValueChange={(value) => setModelRef(value === "__none__" ? "" : value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a model (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  <span className="text-muted-foreground">None</span>
                </SelectItem>
                {modelsLoading ? (
                  <SelectItem value="__loading__" disabled>
                    Loading models...
                  </SelectItem>
                ) : (
                  models.map((model) => (
                    <SelectItem key={model.name} value={model.name}>
                      {model.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Parameters (Optional)</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addParameter}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Parameter
              </Button>
            </div>
            {parameters.length > 0 && (
              <div className="space-y-2 border rounded-md p-3">
                {parameters.map((param, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <Input
                      placeholder="Parameter name"
                      value={param.name}
                      onChange={(e) => updateParameter(index, "name", e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      placeholder="Parameter value"
                      value={param.value}
                      onChange={(e) => updateParameter(index, "value", e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeParameter(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Resource Selector (Optional)</Label>
              <div className="flex gap-2">
                {!selector && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelector({
                      resource: "Query",
                      labelSelector: {
                        matchLabels: {},
                        matchExpressions: []
                      }
                    })}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Selector
                  </Button>
                )}
                {selector && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelector(null)}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Remove Selector
                  </Button>
                )}
              </div>
            </div>
            {selector && (
              <div className="border rounded-md p-3 space-y-3">
                <div className="space-y-1">
                  <Label className="text-sm">Resource Type</Label>
                  <Select
                    value={selector.resource}
                    onValueChange={(value) => setSelector({ ...selector, resource: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Query">Query</SelectItem>
                      <SelectItem value="Agent">Agent</SelectItem>
                      <SelectItem value="Model">Model</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Match Labels</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addMatchLabel}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Label
                    </Button>
                  </div>
                  {Object.entries(selector.labelSelector?.matchLabels || {}).map(([key, value], index) => (
                    <div key={`label-${index}`} className="flex gap-2 items-center">
                      <Input
                        placeholder="Label key"
                        value={key}
                        onChange={(e) => updateMatchLabel(key, e.target.value, value)}
                        className="flex-1"
                      />
                      <Input
                        placeholder="Label value"
                        value={value}
                        onChange={(e) => updateMatchLabel(key, key, e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeMatchLabel(key)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        )}

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
            disabled={isSubmitting || evaluatorLoading || !name || !address}
          >
            {isSubmitting
              ? "Saving..."
              : isEditing
              ? "Update Evaluator"
              : "Create Evaluator"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}