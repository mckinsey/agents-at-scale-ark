'use client';

import { NoDefaultModelAlert } from '@/components/alerts';
import {
  HomepageAgentsCard,
  HomepageMcpServersCard,
  HomepageMemoryCard,
  HomepageModelsCard,
  HomepageTeamsCard,
} from '@/components/cards';
import { PageHeader } from '@/components/common/page-header';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function HomePage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader />
      <ScrollArea className="min-h-0 flex-1">
        <main className="flex flex-col gap-8">
          <section className="flex flex-col gap-1">
            <h2 className="text-fg-primary text-xl font-normal leading-7">
              Welcome to the ARK Dashboard
            </h2>
            <p className="text-fg-tertiary text-base leading-6 tracking-[-0.016px]">
              Monitor and manage your AI infrastructure from one central
              location
            </p>
          </section>
          <section className="space-y-4">
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
      </ScrollArea>
    </div>
  );
}
