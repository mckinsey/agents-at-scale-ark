"use client"

import { useState } from "react"
import { Pencil, Trash2, Globe, Settings } from "lucide-react"
import { DASHBOARD_SECTIONS } from "@/lib/constants/dashboard-icons"
import { BaseCard, type BaseCardAction } from "./base-card"
import { EvaluatorEditor } from "@/components/editors"
import type {
  Evaluator,
  EvaluatorCreateRequest,
  EvaluatorUpdateRequest
} from "@/lib/services"

interface EvaluatorCardProps {
  evaluator: Evaluator
  onUpdate?: (
    evaluator: (EvaluatorCreateRequest | EvaluatorUpdateRequest) & { id?: string }
  ) => void
  onDelete?: (id: string) => void
  namespace: string
}

export function EvaluatorCard({
  evaluator,
  onUpdate,
  onDelete,
  namespace
}: EvaluatorCardProps) {
  const [editorOpen, setEditorOpen] = useState(false)

  const actions: BaseCardAction[] = []

  if (onUpdate) {
    actions.push({
      icon: Pencil,
      label: "Edit evaluator",
      onClick: () => setEditorOpen(true)
    })
  }

  if (onDelete) {
    actions.push({
      icon: Trash2,
      label: "Delete evaluator",
      onClick: () => onDelete(evaluator.name)
    })
  }

  const getAddressDisplay = () => {
    return evaluator.address || "Not configured"
  }

  const getSpecInfo = () => {
    const spec = (evaluator as { spec?: Record<string, unknown> }).spec
    if (!spec) return null
    
    const info = []
    if ((spec.modelRef as { name?: string })?.name) {
      info.push(`Model: ${(spec.modelRef as { name: string }).name}`)
    }
    if ((spec.parameters as unknown[])?.length > 0) {
      info.push(`${(spec.parameters as unknown[]).length} parameter${(spec.parameters as unknown[]).length > 1 ? 's' : ''}`)
    }
    if (spec.selector) {
      info.push('Auto-selector enabled')
    }
    
    return info
  }

  const specInfo = getSpecInfo()

  return (
    <>
      <BaseCard
        title={evaluator.name}
        description={evaluator.description}
        icon={DASHBOARD_SECTIONS.evaluators.icon}
        actions={actions}
        footer={
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Globe className="h-4 w-4" />
              <span>{getAddressDisplay()}</span>
            </div>
            {specInfo && specInfo.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Settings className="h-4 w-4" />
                <span>{specInfo.join(', ')}</span>
              </div>
            )}
          </div>
        }
      />
      <EvaluatorEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        evaluator={evaluator}
        onSave={onUpdate || (() => {})}
        namespace={namespace}
      />
    </>
  )
}