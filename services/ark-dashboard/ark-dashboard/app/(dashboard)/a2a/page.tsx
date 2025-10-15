"use client";

import { A2AServersSection } from "@/components/sections/a2a-servers-section";
import type { A2AServersSectionHandle } from "@/components/sections/a2a-servers-section";
import { useSearchParams } from "next/navigation";
import { Suspense, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { BreadcrumbElement, PageHeader } from "@/components/common/page-header";

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: "ARK Dashboard" }
]

function A2AContent() {
  const searchParams = useSearchParams();
  const namespace = searchParams.get("namespace") || "default";
  const a2aSectionRef = useRef<A2AServersSectionHandle>(null);

  return (
    <>
      <PageHeader breadcrumbs={breadcrumbs} currentPage="A2A Servers" actions={
        <Button onClick={() => a2aSectionRef.current?.openAddEditor()}>
          <Plus className="h-4 w-4 mr-2" />
          Add A2A Server
        </Button>
      } />
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
