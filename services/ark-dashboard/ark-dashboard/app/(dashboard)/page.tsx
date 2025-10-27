import { NoDefaultModelAlert } from '@/components/alerts';
import {
  HomepageAgentsCard,
  HomepageMcpServersCard,
  HomepageMemoryCard,
  HomepageModelsCard,
  HomepageTeamsCard,
} from '@/components/cards';
import { PageHeader } from '@/components/common/page-header';

export default function HomePage() {
  return (
    <div className="bg-background min-h-screen">
      <PageHeader currentPage="ARK Dashboard" />
      <main className="container space-y-8 p-6 py-8">
        <section>
          <h2 className="mb-2 text-3xl font-bold text-balance">
            Welcome to the ARK Dashboard
          </h2>
          <p className="text-muted-foreground text-pretty">
            Monitor and manage your AI infrastructure from one central location.
          </p>
        </section>
        <section>
          <NoDefaultModelAlert />
        </section>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
