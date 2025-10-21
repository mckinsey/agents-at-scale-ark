"use client"

import { useRef } from "react"
import { useSearchParams } from "next/navigation"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EvaluationsSection } from "@/components/sections"
import { BreadcrumbElement, PageHeader } from "@/components/common/page-header"

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: "ARK Dashboard" }
]

export default function EvaluationsPage() {
  const searchParams = useSearchParams()
  const queryFilter = searchParams.get("query")
  const evaluationsSectionRef = useRef<{ openAddEditor: () => void }>(null)

  return (
    <>
      <PageHeader breadcrumbs={breadcrumbs} currentPage="Evaluations" actions={
        <Button onClick={() => evaluationsSectionRef.current?.openAddEditor()}>
          <Plus className="h-4 w-4" />
          Create Evaluation
        </Button>
      } />
      <div className="flex flex-1 flex-col gap-4 p-4">
        <EvaluationsSection
          ref={evaluationsSectionRef}
          initialQueryFilter={queryFilter}
        />
      </div>
    </>
  )
}