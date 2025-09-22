"use client"

import type React from "react"
import { useState, useEffect, forwardRef, useImperativeHandle } from "react"
import { toast } from "@/components/ui/use-toast"
import { ModelEditor } from "@/components/editors"
import { modelsService, type Model, type ModelCreateRequest, type ModelUpdateRequest } from "@/lib/services"
import { ModelCard } from "@/components/cards"
import { useDelayedLoading } from "@/lib/hooks"
import { ModelRow } from "@/components/rows/model-row"
import { ToggleSwitch, type ToggleOption } from "@/components/ui/toggle-switch"

interface ModelsSectionProps {
  namespace: string
}

export const ModelsSection = forwardRef<{ openAddEditor: () => void }, ModelsSectionProps>(function ModelsSection({ namespace }, ref) {
  const [models, setModels] = useState<Model[]>([])
  const [modelEditorOpen, setModelEditorOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const showLoading = useDelayedLoading(loading)
  const [showCompactView, setShowCompactView] = useState(false)
  
  const viewOptions: ToggleOption[] = [
    { id: "compact", label: "compact view", active: !showCompactView },
    { id: "card", label: "card view", active: showCompactView }
  ]

  useImperativeHandle(ref, () => ({
    openAddEditor: () => setModelEditorOpen(true)
  }));

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const modelsData = await modelsService.getAll(namespace)
        setModels(modelsData)
      } catch (error) {
        console.error("Failed to load data:", error)
        toast({
          variant: "destructive",
          title: "Failed to Load Data",
          description: error instanceof Error ? error.message : "An unexpected error occurred"
        })
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [namespace])

  const handleSaveModel = async (model: ModelCreateRequest | (ModelUpdateRequest & { id: string })) => {
    try {
      if ('id' in model) {
        // Update existing model
        const { id, ...updateData } = model
        await modelsService.updateById(namespace, id, updateData)
        toast({
          variant: "success",
          title: "Model Updated",
          description: `Successfully updated model`
        })
      } else {
        // Create new model
        await modelsService.create(namespace, model)
        toast({
          variant: "success",
          title: "Model Created",
          description: `Successfully created ${model.name}`
        })
      }
      // Reload data
      const updatedModels = await modelsService.getAll(namespace)
      setModels(updatedModels)
    } catch (error) {
      toast({
        variant: "destructive",
        title: 'id' in model ? "Failed to Update Model" : "Failed to Create Model",
        description: error instanceof Error ? error.message : "An unexpected error occurred"
      })
    }
  }

  const handleDeleteModel = async (id: string) => {
    try {
      const model = models.find(m => m.id === id)
      if (!model) {
        throw new Error("Model not found")
      }
      await modelsService.deleteById(namespace, id)
      toast({
        variant: "success",
        title: "Model Deleted",
        description: `Successfully deleted ${model.name}`
      })
      // Reload data
      const updatedModels = await modelsService.getAll(namespace)
      setModels(updatedModels)
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Failed to Delete Model",
        description: error instanceof Error ? error.message : "An unexpected error occurred"
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
        <div className="flex items-center justify-end px-6 py-3">
          <ToggleSwitch
            options={viewOptions}
            onChange={(id) => setShowCompactView(id === "card")}
          />
        </div>
        
        <main className="flex-1 overflow-auto px-6 py-0">
          {showCompactView && (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 pb-6">
              {models.map((model) => (
                <ModelCard
                  key={model.id}
                  model={model}
                  onUpdate={handleSaveModel}
                  onDelete={handleDeleteModel}
                  namespace={namespace}
                />
              ))}
            </div>
          )}
          
          {!showCompactView && (
            <div className="flex flex-col gap-3">
              {models.map((model) => (
                <ModelRow
                  key={model.id}
                  model={model}
                  onUpdate={handleSaveModel}
                  onDelete={handleDeleteModel}
                  namespace={namespace}
                />
              ))}
            </div>
          )}
        </main>
      </div>
      
      <ModelEditor
        open={modelEditorOpen}
        onOpenChange={setModelEditorOpen}
        model={null}
        onSave={handleSaveModel}
        namespace={namespace}
      />
    </>
  )
});