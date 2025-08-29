"use client"

import type React from "react"
import { useState, useEffect, forwardRef, useImperativeHandle } from "react"
import { toast } from "@/components/ui/use-toast"
import { EvaluatorEditor } from "@/components/editors"
import { evaluatorsService, type Evaluator, type EvaluatorCreateRequest, type EvaluatorUpdateRequest } from "@/lib/services"
import { EvaluatorCard } from "@/components/cards"
import { useDelayedLoading } from "@/lib/hooks"

interface EvaluatorsSectionProps {
  namespace: string
}

export const EvaluatorsSection = forwardRef<{ openAddEditor: () => void }, EvaluatorsSectionProps>(function EvaluatorsSection({ namespace }, ref) {
  const [evaluators, setEvaluators] = useState<Evaluator[]>([])
  const [evaluatorEditorOpen, setEvaluatorEditorOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const showLoading = useDelayedLoading(loading)

  useImperativeHandle(ref, () => ({
    openAddEditor: () => setEvaluatorEditorOpen(true)
  }))

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const evaluatorsData = await evaluatorsService.getAll(namespace)
        setEvaluators(evaluatorsData)
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Failed to Load Evaluators",
          description: error instanceof Error ? error.message : "An unexpected error occurred",
        })
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [namespace])

  const handleSaveEvaluator = async (evaluator: (EvaluatorCreateRequest | EvaluatorUpdateRequest) & { id?: string }) => {
    try {
      if (evaluator.id) {
        const updateRequest = evaluator as EvaluatorUpdateRequest & { id: string }
        await evaluatorsService.update(namespace, updateRequest.id, updateRequest)
        toast({
          variant: "success",
          title: "Evaluator Updated",
          description: "Successfully updated the evaluator",
        })
      } else {
        const createRequest = evaluator as EvaluatorCreateRequest
        await evaluatorsService.create(namespace, createRequest)
        toast({
          variant: "success",
          title: "Evaluator Created",
          description: `Successfully created ${createRequest.name}`,
        })
      }
      const updatedEvaluators = await evaluatorsService.getAll(namespace)
      setEvaluators(updatedEvaluators)
    } catch (error) {
      toast({
        variant: "destructive",
        title: evaluator.id ? "Failed to Update Evaluator" : "Failed to Create Evaluator",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
      })
    }
  }

  const handleDeleteEvaluator = async (name: string) => {
    try {
      const evaluator = evaluators.find(e => e.name === name)
      if (!evaluator) {
        throw new Error("Evaluator not found")
      }
      await evaluatorsService.delete(namespace, name)
      toast({
        variant: "success",
        title: "Evaluator Deleted",
        description: `Successfully deleted ${evaluator.name}`,
      })
      const updatedEvaluators = await evaluatorsService.getAll(namespace)
      setEvaluators(updatedEvaluators)
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to Delete Evaluator",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
      })
    }
  }

  if (showLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center py-8">Loading...</div>
      </div>
    )
  }

  return (
    <>
      <div className="flex h-full flex-col">
        <main className="flex-1 overflow-auto p-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 pb-6">
            {evaluators.map((evaluator) => (
              <EvaluatorCard 
                key={evaluator.name} 
                evaluator={evaluator} 
                onUpdate={handleSaveEvaluator}
                onDelete={handleDeleteEvaluator}
                namespace={namespace}
              />
            ))}
          </div>
        </main>
      </div>
      
      <EvaluatorEditor
        open={evaluatorEditorOpen}
        onOpenChange={setEvaluatorEditorOpen}
        evaluator={null}
        onSave={handleSaveEvaluator}
        namespace={namespace}
      />
    </>
  )
})