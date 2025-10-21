"use client"

import { ModelsSection } from "@/components/sections/models-section"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import Link from "next/link"
import { BreadcrumbElement, PageHeader } from "@/components/common/page-header"

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: "ARK Dashboard" }
]

export default function ModelsPage() {
  const searchParams = useSearchParams()
  const namespace = searchParams.get("namespace") || "default"

  return (
    <>
      <PageHeader breadcrumbs={breadcrumbs} currentPage="Models" actions={
        <Link href="/models/new">
          <Button>
            <Plus className="h-4 w-4" />
            Add Model
          </Button>
        </Link>
      } />
      <div className="flex flex-1 flex-col">
        <ModelsSection namespace={namespace} />
      </div>
    </>
  )
}