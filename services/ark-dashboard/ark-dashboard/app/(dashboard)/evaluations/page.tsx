"use client"

import { Suspense, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { Plus } from "lucide-react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { EvaluationsSection } from "@/components/sections"

function EvaluationsContent() {
  const searchParams = useSearchParams()
  const namespace = searchParams.get("namespace") || "default"
  const queryFilter = searchParams.get("query")
  const evaluationsSectionRef = useRef<{ openAddEditor: () => void }>(null)

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href="/">
                ARK Dashboard
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>Evaluations</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto">
          <Button onClick={() => evaluationsSectionRef.current?.openAddEditor()}>
            <Plus className="h-4 w-4" />
            Add Evaluation
          </Button>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4">
        <EvaluationsSection 
          ref={evaluationsSectionRef} 
          namespace={namespace} 
          initialQueryFilter={queryFilter}
        />
      </div>
    </>
  )
}

export default function EvaluationsPage() {
  return (
    <Suspense>
      <EvaluationsContent />
    </Suspense>
  )
}