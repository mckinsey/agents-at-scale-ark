'use client';

import { useParams } from 'next/navigation';
import { useMemo } from 'react';

import { DetailBreadcrumb } from '@/components/common/detail-breadcrumb';
import {
  DetailCard,
  DetailRow,
  DetailSectionCard,
} from '@/components/common/detail-card';
import { JsonViewer } from '@/components/common/json-viewer';
import { NamespacedLink } from '@/components/namespaced-link';
import { A2AServerStatus } from '@/components/sections/a2a-server-status';
import { ResourceErrorState } from '@/components/sections/resource-list-states';
import { Button } from '@/components/ui/button';
import { summarizeA2AServerStatus } from '@/lib/services/a2a-servers';
import { useA2AServer } from '@/lib/services/a2a-servers-hooks';

const EMPTY = '—';

export default function A2AServerPage() {
  const params = useParams();
  const name = params.name as string;

  const { data: server, isLoading, error } = useA2AServer(name);

  const status = useMemo(
    () => summarizeA2AServerStatus(server?.status),
    [server?.status],
  );

  const metadata = useMemo(
    () => ({
      labels: server?.labels ?? {},
      annotations: server?.annotations ?? {},
    }),
    [server?.labels, server?.annotations],
  );

  const breadcrumb = (
    <DetailBreadcrumb
      backHref="/a2a"
      backLabel="A2A servers"
      current={server?.name || name}
    />
  );

  if (isLoading) {
    return (
      <div className="content-shell flex h-full w-full flex-col">
        {breadcrumb}
        <div className="mt-5 flex flex-1 items-center justify-center">
          <span className="label-regular-primary text-fg-secondary">
            Loading...
          </span>
        </div>
      </div>
    );
  }

  if (!server) {
    return (
      <div className="content-shell flex h-full w-full flex-col">
        {breadcrumb}
        <div className="mt-5 flex flex-1 flex-col items-center justify-center gap-3">
          <p className="headings-h3-regular text-fg-primary">
            {error ? "Couldn't load this A2A server" : 'A2A server not found'}
          </p>
          {error && (
            <p className="label-regular-primary text-fg-secondary">
              {error instanceof Error ? error.message : String(error)}
            </p>
          )}
          <Button variant="outline" asChild>
            <NamespacedLink href="/a2a">Back to A2A servers</NamespacedLink>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="content-shell flex h-full w-full flex-col gap-5">
      <div className="flex flex-col gap-1">
        {breadcrumb}
        <h1 className="headings-h3-regular text-fg-primary break-all">
          {server.name || name}
        </h1>
      </div>

      {error && (
        <ResourceErrorState
          title="Couldn't refresh this A2A server"
          description="Showing the last loaded version."
        />
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto">
        <div className="flex flex-none flex-col gap-3 lg:flex-row">
          <DetailCard title="Identify">
            <DetailRow label="Name" value={server.name || EMPTY} />
            <DetailRow label="ID" value={server.id || EMPTY} />
            <DetailRow
              label="Description"
              value={server.description || EMPTY}
            />
            <DetailRow
              label="Address"
              value={status.address || EMPTY}
              valueClassName="min-w-0 break-all"
              last
            />
          </DetailCard>

          <DetailCard title="All Status">
            <DetailRow
              label="Status"
              value={<A2AServerStatus ready={status.ready} />}
              valueClassName="min-w-0"
              tooltip="Whether Ark could discover the agent card at this address"
            />
            <DetailRow
              label="Ready"
              value={status.ready ? 'True' : 'False'}
              tooltip="Ready condition reported by the A2AServer resource"
            />
            <DetailRow
              label="Discovering"
              value={status.discovering ? 'True' : 'False'}
              tooltip="Whether Ark is currently probing the agent card endpoints"
            />
            <DetailRow
              label="Status message"
              value={status.statusMessage || EMPTY}
              valueClassName="min-w-0 break-words"
              last
            />
          </DetailCard>
        </div>

        <DetailSectionCard
          title="Metadata (labels & annotations)"
          className="min-h-[240px] flex-1"
          bodyClassName="min-h-0 flex-1 overflow-hidden">
          <JsonViewer
            className="h-full"
            value={metadata}
            fileName={server.name || name}
          />
        </DetailSectionCard>
      </div>
    </div>
  );
}
