"use client"

import { AgentsSection } from "@/components/sections/agents-section"
import { useRef } from "react"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { BreadcrumbElement, PageHeader } from "@/components/common/page-header"

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: "ARK Dashboard" }
]

export default function AgentsPage() {
  const agentsSectionRef = useRef<{ openAddEditor: () => void }>(null)

  return (
    <>
      <PageHeader breadcrumbs={breadcrumbs} currentPage="Agents" actions={
        <Button onClick={() => agentsSectionRef.current?.openAddEditor()}>
          <Plus className="h-4 w-4" />
          Create Agent
        </Button>
      } />
      <div className="flex flex-1 flex-col">
        <AgentsSection ref={agentsSectionRef} />
      </div>
    </>
  )
}