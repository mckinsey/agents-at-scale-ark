import { Wrench, Trash2, Info, MessageCircle } from "lucide-react"
import { BaseCard, type BaseCardAction } from "./base-card"
import { useRouter } from "next/navigation"
import type { Tool } from "@/lib/services/tools"

interface ToolCardProps {
  tool: Tool
  onDelete?: (id: string) => void
  onInfo?: (tool: Tool) => void
  deleteDisabled?: boolean
  deleteDisabledReason?: string
  namespace?: string
}

export function ToolCard({ tool, onDelete, onInfo, deleteDisabled, deleteDisabledReason, namespace }: ToolCardProps) {
  const router = useRouter();
  const actions: BaseCardAction[] = []

  if (onInfo) {
    actions.push({
      icon: Info,
      label: "View tool details",
      onClick: () => onInfo(tool)
    })
  }

  if (onDelete) {
    actions.push({
      icon: Trash2,
      label: deleteDisabled && deleteDisabledReason ? deleteDisabledReason : "Delete tool",
      onClick: () => onDelete(tool.id),
      disabled: deleteDisabled
    })
  }

  actions.push({
    icon: MessageCircle,
    label: "Query tool",
    onClick: () => router.push(`/query/new?namespace=${namespace || 'default'}`)
  });

  return (
    <BaseCard
      title={tool.name || tool.type || "Unnamed Tool"}
      description={tool.type || "Tool"}
      icon={Wrench}
      iconClassName="text-muted-foreground"
      actions={actions}
    >
      <div />
    </BaseCard>
  )
}