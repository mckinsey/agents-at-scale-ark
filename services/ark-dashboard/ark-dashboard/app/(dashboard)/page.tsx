'use client';

import { NoDefaultModelAlert } from '@/components/alerts';
import {
  HomepageAgentsCard,
  HomepageMcpServersCard,
  HomepageMemoryCard,
  HomepageModelsCard,
  HomepageTeamsCard,
} from '@/components/cards';
import { Dashboard } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNamespace } from '@/providers/NamespaceProvider';

export default function HomePage() {
  const { readOnlyMode } = useNamespace();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1">
                <IconShell size="default" variant="primary">
                  <Dashboard />
                </IconShell>
                <h1 className="text-fg-primary text-2xl leading-8 tracking-[-0.096px]">
                  Home
                </h1>
              </div>
              <p className="text-fg-secondary text-sm leading-5 tracking-[-0.028px]">
                Monitor and manage your AI infrastructure from one central
                location
              </p>
            </div>
            {readOnlyMode ? (
              <Button disabled>Create agent</Button>
            ) : (
              <NamespacedLink href="/agents/new">
                <Button>Create agent</Button>
              </NamespacedLink>
            )}
          </div>

          <NoDefaultModelAlert />

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <HomepageModelsCard />
            <HomepageAgentsCard />
            <HomepageTeamsCard />
            <HomepageMcpServersCard />
            <HomepageMemoryCard />
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
