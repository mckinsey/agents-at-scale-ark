"use client"

import { TeamsSection } from "@/components/sections/teams-section"
import { Suspense, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { BreadcrumbElement, PageHeader } from "@/components/common/page-header"

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: "ARK Dashboard" }
]

function TeamsContent() {
  const teamsSectionRef = useRef<{ openAddEditor: () => void }>(null)

  return (
    <>
      <PageHeader breadcrumbs={breadcrumbs} currentPage="Teams" actions={
        <Button onClick={() => teamsSectionRef.current?.openAddEditor()}>
          <Plus className="h-4 w-4 mr-2" />
          Add Team
        </Button>
      } />
      <div className="flex flex-1 flex-col">
        <TeamsSection ref={teamsSectionRef} />
      </div>
    </>
  )
}

export default function TeamsPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center">Loading...</div>}>
      <TeamsContent />
    </Suspense>
  )
}