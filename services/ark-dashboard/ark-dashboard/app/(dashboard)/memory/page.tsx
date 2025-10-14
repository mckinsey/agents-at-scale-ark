"use client"

import { MemorySection } from "@/components/sections/memory-section"
import { useSearchParams } from "next/navigation"
import { BreadcrumbElement, PageHeader } from "@/components/common/page-header"

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: "ARK Dashboard" }
]

export default function MemoryPage() {
  const searchParams = useSearchParams()

  // Extract filter parameters from URL
  const initialFilters = {
    memoryName: searchParams.get("memory") || undefined,
    sessionId: searchParams.get("sessionId") || undefined
  }

  return (
    <>
      <PageHeader breadcrumbs={breadcrumbs} currentPage="Memory" />
      <div className="flex flex-1 flex-col">
        <MemorySection initialFilters={initialFilters} />
      </div>
    </>
  )
}