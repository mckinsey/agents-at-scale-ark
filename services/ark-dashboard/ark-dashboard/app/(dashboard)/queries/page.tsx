"use client"

import { QueriesSection } from "@/components/sections/queries-section"
import { useSearchParams, useRouter } from "next/navigation"
import { Suspense } from "react"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

function QueriesContent() {
  const searchParams = useSearchParams()
  const namespace = searchParams.get("namespace") || "default"
  const router = useRouter()
  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Queries</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto">
          <Button onClick={() => router.push(`/query/new?namespace=${namespace}`)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Query
          </Button>
        </div>
      </header>
      <div className="flex flex-1 flex-col">
        <QueriesSection namespace={namespace} />
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