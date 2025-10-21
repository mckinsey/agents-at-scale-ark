"use client"

import { ToolsSection } from "@/components/sections/tools-section"
import { useSearchParams } from "next/navigation"
import { useRef } from "react"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { BreadcrumbElement, PageHeader } from "@/components/common/page-header"

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: "ARK Dashboard" }
]

export default function ToolsPage() {
  const searchParams = useSearchParams()
  const namespace = searchParams.get("namespace") || "default"
  const toolsSectionRef = useRef<{ openAddEditor: () => void }>(null)

  return (
    <>
      <PageHeader breadcrumbs={breadcrumbs} currentPage="Tools" actions={
        <Button onClick={() => toolsSectionRef.current?.openAddEditor()}>
          <Plus className="h-4 w-4" />
          Add Tool
        </Button>
      } />
      <div className="flex flex-1 flex-col">
        <ToolsSection ref={toolsSectionRef} namespace={namespace} />
      </div>
    </>
  )
}