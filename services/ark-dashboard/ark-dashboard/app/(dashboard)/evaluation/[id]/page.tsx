"use client"

import { Suspense } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { SidebarTrigger } from "@/components/ui/sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from "@/components/ui/breadcrumb"
import { EvaluationDetailView } from "@/components/evaluation"

function EvaluationDetailContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const evaluationId = params.id as string
  const namespace = searchParams.get("namespace") || "default"
  const enhanced = searchParams.get("enhanced") === "true"

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
              <BreadcrumbLink href={`/evaluations?namespace=${namespace}`}>
                Evaluations
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>{evaluationId}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4">
        <EvaluationDetailView evaluationId={evaluationId} namespace={namespace} enhanced={enhanced} />
      </div>
    </>
  )
}

export default function EvaluationDetailPage() {
  return (
    <Suspense>
      <EvaluationDetailContent />
    </Suspense>
  )
}