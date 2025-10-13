"use client"

import { SecretsSection } from "@/components/sections/secrets-section"
import { useSearchParams } from "next/navigation"
import { Suspense, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { BreadcrumbElement, PageHeader } from "@/components/common/page-header"

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: "ARK Dashboard" }
]

function SecretsContent() {
  const searchParams = useSearchParams()
  const namespace = searchParams.get("namespace") || "default"
  const secretsSectionRef = useRef<{ openAddEditor: () => void }>(null)

  return (
    <>
      <PageHeader breadcrumbs={breadcrumbs} currentPage="Secrets" actions={
        <Button onClick={() => secretsSectionRef.current?.openAddEditor()}>
          <Plus className="h-4 w-4 mr-2" />
          Add Secret
        </Button>
      } />
      <div className="flex flex-1 flex-col">
        <SecretsSection ref={secretsSectionRef} namespace={namespace} />
      </div>
    </>
  )
}

export default function SecretsPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center">Loading...</div>}>
      <SecretsContent />
    </Suspense>
  )
}