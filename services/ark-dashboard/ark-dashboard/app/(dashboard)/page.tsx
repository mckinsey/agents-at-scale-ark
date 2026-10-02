'use client';

import { NoDefaultModelAlert } from '@/components/alerts';
import {
  HomepageAgentsCard,
  HomepageMcpServersCard,
  HomepageMemoryCard,
  HomepageModelsCard,
  HomepageTeamsCard,
} from '@/components/cards';
import { ResourcePageHeader } from '@/components/common/resource-page-header';
import { Dashboard } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNamespace } from '@/providers/NamespaceProvider';

export default function HomePage() {
  const { readOnlyMode } = useNamespace();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex w-full content-shell flex-col gap-5">
          <ResourcePageHeader
            icon={<Dashboard />}
            title="Home"
            description="Monitor and manage your AI infrastructure from one central location"
            actions={
              readOnlyMode ? (
                <Button disabled>Create agent</Button>
              ) : (
                <NamespacedLink href="/agents/new">
                  <Button>Create agent</Button>
                </NamespacedLink>
              )
            }
          />

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
