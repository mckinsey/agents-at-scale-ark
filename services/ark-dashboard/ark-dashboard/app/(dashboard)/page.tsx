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
import { InitialModelConfiguratorForm } from "@/components/forms/initial-model-configuration-form";
import { Spinner } from "@/components/ui/spinner";

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
      <main className="container p-6 pt-8">
        <h2 className="text-3xl font-bold text-balance mb-2">
          Welcome to the ARK Dashboard
        </h2>
        <p className="text-muted-foreground text-pretty">
          Monitor and manage your AI infrastructure from one central location.
        </p>
        {
          models?.length === 0 ? (<InitialModelConfiguratorForm />) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 py-8">
              <HomepageModelsCard />
              <HomepageAgentsCard />
              <HomepageTeamsCard />
              <HomepageMcpServersCard />
              <HomepageMemoryCard />
            </div>
          )
        }
      </main>
    </div>
  );
}
