"use client";

import {
  HomepageAgentsCard,
  HomepageMemoryCard,
  HomepageModelsCard,
  HomepageMcpServersCard,
  HomepageTeamsCard
} from "@/components/cards";
import { toast } from "@/components/ui/use-toast";
import { useGetAllModels } from "@/lib/services/models-hooks";
import { useEffect } from "react";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangleIcon, ArrowRight } from "lucide-react";
import Link from "next/link";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from "@/components/ui/breadcrumb";

export default function HomePage() {
  const { data: models, isPending, error } = useGetAllModels();

  useEffect(() => {
    if (error) {
      toast({
        variant: "destructive",
        title: "Failed to get Models",
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred"
      });
    }
  }, [error]);

  if (isPending) {
    return (
      <div className="w-full h-screen flex justify-center items-center">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>ARK Dashboard</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>
      <main className="container p-6 py-8 space-y-8">
        <section>
          <h2 className="text-3xl font-bold text-balance mb-2">
            Welcome to the ARK Dashboard
          </h2>
          <p className="text-muted-foreground text-pretty">
            Monitor and manage your AI infrastructure from one central location.
          </p>
        </section>
        {!models?.some(m => m.name === 'default') && <section>
          <Link href="/models/new?name=default">
            <Alert variant='warning' className="flex gap-2 flex-row flex-wrap">
              <div className="flex items-center gap-1">
                <AlertTriangleIcon className="w-4 h-4" />
                <AlertTitle>You have no default Model configured.</AlertTitle>
              </div>
              <AlertDescription className="flex text-primary items-center ml-auto">
                <span>Configure Default Model</span>
                <ArrowRight className="h-4 w-4" />
              </AlertDescription>
            </Alert>
          </Link>
        </section>}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
          <HomepageModelsCard />
          <HomepageAgentsCard />
          <HomepageTeamsCard />
          <HomepageMcpServersCard />
          <HomepageMemoryCard />
        </div>
      </main>
    </div>
  );
}
