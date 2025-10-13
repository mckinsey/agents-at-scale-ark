"use client"

import { AgentsSection } from "@/components/sections/agents-section"
import { Suspense, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { BreadcrumbElement, PageHeader } from "@/components/common/page-header"

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: "ARK Dashboard" }
]

function AgentsContent() {
  const agentsSectionRef = useRef<{ openAddEditor: () => void }>(null)

  return (
    <>
      <PageHeader breadcrumbs={breadcrumbs} currentPage="Agents" actions={
        <Button onClick={() => agentsSectionRef.current?.openAddEditor()}>
          <Plus className="h-4 w-4 mr-2" />
          Add Agent
        </Button>
      } />
      <div className="flex flex-1 flex-col">
        <AgentsSection ref={agentsSectionRef} />
      </div>
    </>
  )
}

export default function AgentsPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center">Loading...</div>}>
      <AgentsContent />
    </Suspense>
  )
}