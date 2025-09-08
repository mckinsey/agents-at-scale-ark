"use client"

import { MemorySection } from "@/components/sections/memory-section"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

function MemoryContent() {
  const searchParams = useSearchParams()
  const namespace = searchParams.get("namespace") || "default"

  // Extract filter parameters from URL
  const initialFilters = {
    memoryName: searchParams.get("memory") || undefined,
    sessionId: searchParams.get("sessionId") || undefined
  }

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Memory</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>
      <div className="flex flex-1 flex-col">
        <MemorySection namespace={namespace} initialFilters={initialFilters} />
      </div>
    </>
  )
}

export default function MemoryPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <MemoryContent />
    </Suspense>
  )
}