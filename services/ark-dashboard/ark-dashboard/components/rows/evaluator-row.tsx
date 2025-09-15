"use client"

import { useRouter } from "next/navigation"
import { Pencil, Trash2, Settings, Globe } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip"
import type { Evaluator } from "@/lib/services"

interface EvaluatorRowProps {
  evaluator: Evaluator
  onDelete?: (id: string) => void
  namespace: string
}

export function EvaluatorRow({
  evaluator,
  onDelete,
  namespace
}: EvaluatorRowProps) {
  const router = useRouter()

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
    
    return info.length > 0 ? info.join(", ") : null
  }

  return (
    <>
      <div className="flex items-center py-3 px-4 bg-card border rounded-md hover:bg-accent/5 transition-colors w-full gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="flex-shrink-0">
            <div className="w-10 h-10 rounded-md bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center">
              <Settings className="w-5 h-5 text-white" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-sm truncate">
                {evaluator.name}
              </h3>
            </div>
            
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Globe className="w-3 h-3" />
                <span className="truncate max-w-[150px]">
                  {getAddressDisplay()}
                </span>
              </div>
              
              {getSpecInfo() && (
                <div className="hidden sm:block">
                  <Badge variant="secondary" className="text-xs">
                    {getSpecInfo()}
                  </Badge>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push(`/evaluators/${evaluator.name}/edit?namespace=${namespace}`)}
                  className="h-8 w-8 p-0"
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Edit evaluator</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {onDelete && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(evaluator.name)}
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Delete evaluator</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
    </>
  )
}