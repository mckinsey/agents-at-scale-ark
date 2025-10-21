"use client"

import { TeamsSection } from "@/components/sections/teams-section"
import { useRef } from "react"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { BreadcrumbElement, PageHeader } from "@/components/common/page-header"

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: "ARK Dashboard" }
]

export default function TeamsPage() {
  const teamsSectionRef = useRef<{ openAddEditor: () => void }>(null)

  return (
    <>
      <PageHeader breadcrumbs={breadcrumbs} currentPage="Teams" actions={
        <Button onClick={() => teamsSectionRef.current?.openAddEditor()}>
          <Plus className="h-4 w-4" />
          Create Team
        </Button>
      } />
      <div className="flex flex-1 flex-col">
        <TeamsSection ref={teamsSectionRef} />
      </div>
    </>
  )
}