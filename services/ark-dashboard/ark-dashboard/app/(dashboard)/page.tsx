"use client";

import {
  HomepageAgentsCard,
  HomepageMemoryCard,
  HomepageModelsCard,
  HomepageMcpServersCard,
  HomepageTeamsCard
} from "@/components/cards";
import { toast } from "sonner"
import { useGetAllModels } from "@/lib/services/models-hooks";
import { useEffect } from "react";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangleIcon, ArrowRight } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";

export default function HomePage() {
  const { data: models, isPending, error } = useGetAllModels();

  useEffect(() => {
    if (error) {
      toast.error("Failed to get Models", {
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
      <PageHeader currentPage="ARK Dashboard" />
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
