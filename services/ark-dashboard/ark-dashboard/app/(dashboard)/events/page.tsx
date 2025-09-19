"use client"

import { EventsSection } from "@/components/sections/events-section"
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

function EventsContent() {
  const searchParams = useSearchParams()
  const namespace = searchParams.get("namespace") || "default"

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Events</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>
      <div className="flex flex-1 flex-col">
        <EventsSection namespace={namespace} />
      </div>
    </>
  )
}

export default function EventsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64">Loading events...</div>}>
      <EventsContent />
    </Suspense>
  )
}
