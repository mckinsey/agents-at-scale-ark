"use client";

import { A2AServersSection } from "@/components/sections/a2a-servers-section";
import type { A2AServersSectionHandle } from "@/components/sections/a2a-servers-section";
import { useSearchParams } from "next/navigation";
import { Suspense, useRef } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

function A2AContent() {
  const searchParams = useSearchParams();
  const namespace = searchParams.get("namespace") || "default";
  const a2aSectionRef = useRef<A2AServersSectionHandle>(null);

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 data-[orientation=vertical]:h-4"
        />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>A2A Servers</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto">
          <Button onClick={() => a2aSectionRef.current?.openAddEditor()}>
            <Plus className="h-4 w-4 mr-2" />
            Add A2A Server
          </Button>
        </div>
      </header>

      <div className="flex flex-1 flex-col">
        <A2AServersSection ref={a2aSectionRef} namespace={namespace} />
      </div>
    </>
  );
}

export default function A2APage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          Loading...
        </div>
      }
    >
      <A2AContent />
    </Suspense>
  );
}
