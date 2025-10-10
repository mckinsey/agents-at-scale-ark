"use client"

import { ToolsSection } from "@/components/sections/tools-section"
import { useSearchParams } from "next/navigation"
import { Suspense, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { BreadcrumbElement, PageHeader } from "@/components/common/page-header"

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: "ARK Dashboard" }
]

function ToolsContent() {
  const searchParams = useSearchParams()
  const namespace = searchParams.get("namespace") || "default"
  const toolsSectionRef = useRef<{ openAddEditor: () => void }>(null)

  return (
    <>
      <PageHeader breadcrumbs={breadcrumbs} currentPage="Tools" actions={
        <Button onClick={() => toolsSectionRef.current?.openAddEditor()}>
          <Plus className="h-4 w-4 mr-2" />
          Add Tool
        </Button>
      } />
      <div className="flex flex-1 flex-col">
        <ToolsSection ref={toolsSectionRef} namespace={namespace} />
      </div>
    </>
  )
}

export default function ToolsPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center">Loading...</div>}>
      <ToolsContent />
    </Suspense>
  )
}