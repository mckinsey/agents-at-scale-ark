"use client"

import { TeamsSection } from "@/components/sections/teams-section"
import { Suspense, useRef } from "react"
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

function TeamsContent() {
  const teamsSectionRef = useRef<{ openAddEditor: () => void }>(null)

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Teams</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto">
          <Button onClick={() => teamsSectionRef.current?.openAddEditor()}>
            <Plus className="h-4 w-4 mr-2" />
            Add Team
          </Button>
        </div>
      </header>
      <div className="flex flex-1 flex-col">
        <TeamsSection ref={teamsSectionRef} />
      </div>
    </>
  )
}

export default function TeamsPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center">Loading...</div>}>
      <TeamsContent />
    </Suspense>
  )
}