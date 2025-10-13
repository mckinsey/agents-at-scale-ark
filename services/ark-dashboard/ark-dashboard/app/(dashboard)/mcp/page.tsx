"use client"

import { McpServersSection } from "@/components/sections/mcp-servers-section"
import { useSearchParams } from "next/navigation"
import { Suspense, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { BreadcrumbElement, PageHeader } from "@/components/common/page-header"

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: "ARK Dashboard" }
]

function McpContent() {
  const searchParams = useSearchParams()
  const namespace = searchParams.get("namespace") || "default"
  const mcpSectionRef = useRef<{ openAddEditor: () => void }>(null)

  return (
    <>
      <PageHeader breadcrumbs={breadcrumbs} currentPage="MCP Servers" actions={
        <Button onClick={() => mcpSectionRef.current?.openAddEditor()}>
          <Plus className="h-4 w-4 mr-2" />
          Add MCP Server
        </Button>
      } />
      <div className="flex flex-1 flex-col">
        <McpServersSection ref={mcpSectionRef} namespace={namespace} />
      </div>
    </>
  )
}

export default function McpPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center">Loading...</div>}>
      <McpContent />
    </Suspense>
  )
}