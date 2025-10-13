"use client"

import { QueriesSection } from "@/components/sections/queries-section"
import { Suspense, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { BreadcrumbElement, PageHeader } from "@/components/common/page-header"

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: "ARK Dashboard" }
]

function QueriesContent() {
  const queriesSectionRef = useRef<{ openAddEditor: () => void }>(null)
  return (
    <>
      <PageHeader breadcrumbs={breadcrumbs} currentPage="Queries" actions={
        <Button onClick={() => queriesSectionRef.current?.openAddEditor()}>
          <Plus className="h-4 w-4 mr-2" />
          Add Query
        </Button>
      } />
      <div className="flex flex-1 flex-col">
        <QueriesSection ref={queriesSectionRef} />
      </div>
    </>
  )
}

export default function QueriesPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center">Loading...</div>}>
      <QueriesContent />
    </Suspense>
  )
}
