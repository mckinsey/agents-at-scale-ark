import {
  HomepageAgentsCard,
  HomepageMemoryCard,
  HomepageModelsCard,
  HomepageMcpServersCard,
  HomepageTeamsCard
} from "@/components/cards";
import { PageHeader } from "@/components/common/page-header";
import { NoDefaultModelAlert } from "@/components/alerts";

export default function HomePage() {
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
        <section>
          <NoDefaultModelAlert />
        </section>
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
