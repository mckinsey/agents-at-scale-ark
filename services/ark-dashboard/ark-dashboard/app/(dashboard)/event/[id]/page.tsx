'use client';

import { useParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { DetailBreadcrumb } from '@/components/common/detail-breadcrumb';
import {
  DetailCard,
  DetailRow,
  DetailSectionCard,
} from '@/components/common/detail-card';
import { EventTypeIndicator } from '@/components/common/event-type-indicator';
import { NamespacedLink } from '@/components/namespaced-link';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Event } from '@/lib/services/events';
import { eventsService } from '@/lib/services/events';
import { formatTimestamp } from '@/lib/utils/time';
import { useNamespace } from '@/providers/NamespaceProvider';

function EventBreadcrumb({ current }: Readonly<{ current: string }>) {
  return (
    <DetailBreadcrumb backHref="/events" backLabel="Events" current={current} />
  );
}

function EventDetailContent() {
  const { namespace } = useNamespace();
  const params = useParams();
  const eventId = params.id as string;

  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadEvent = async () => {
      try {
        const eventData = await eventsService.get(namespace, eventId);
        setEvent(eventData);
      } catch (error) {
        toast.error('Failed to Load Event', {
          description:
            error instanceof Error
              ? error.message
              : 'An unexpected error occurred',
        });
      } finally {
        setLoading(false);
      }
    };

    loadEvent();
  }, [namespace, eventId]);

  const breadcrumb = <EventBreadcrumb current={eventId} />;

  if (loading) {
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

  if (!event) {
    return (
      <div className="content-shell flex h-full w-full flex-col">
        {breadcrumb}
        <div className="mt-5 flex flex-1 flex-col items-center justify-center gap-3">
          <p className="headings-h3-regular text-fg-primary">Event not found</p>
          <NamespacedLink href="/events">
            <Button variant="outline">Back to events</Button>
          </NamespacedLink>
        </div>
      </div>
    );
  }

  return (
    <div className="content-shell flex h-full w-full flex-col gap-5">
      <div className="flex flex-col gap-1">
        <EventBreadcrumb current={event.name} />
        <h1 className="headings-h2-regular text-fg-primary break-all">
          {event.name}
        </h1>
      </div>

      <ScrollArea className="h-0 min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-5 lg:flex-row">
            <DetailCard title="Basic information">
              <DetailRow
                label="Name"
                value={event.name}
                tooltip="Unique identifier of the event"
              />
              <DetailRow
                label="Namespace"
                value={event.namespace ?? '—'}
                tooltip="Kubernetes namespace containing the event"
              />
              <DetailRow
                label="UID"
                value={event.uid ?? '—'}
                tooltip="Unique identifier assigned by Kubernetes"
              />
              <DetailRow
                label="Type"
                value={<EventTypeIndicator type={event.type} />}
                valueClassName="min-w-0"
                tooltip="Event type: Normal (informational) or Warning (error/issue)"
              />
              <DetailRow
                label="Reason"
                value={event.reason ?? '—'}
                tooltip="Brief reason code for the event"
              />
              <DetailRow
                label="Count"
                value={event.count ?? '—'}
                tooltip="Number of times this event has occurred"
                last
              />
            </DetailCard>

            <DetailCard title="Involved object">
              <DetailRow
                label="Kind"
                value={event.involvedObjectKind ?? '—'}
                tooltip="Type of Kubernetes resource (Agent, Team, Query, etc.)"
              />
              <DetailRow
                label="Name"
                value={event.involvedObjectName ?? '—'}
                tooltip="Name of the resource that triggered this event"
              />
              <DetailRow
                label="Namespace"
                value={event.involvedObjectNamespace ?? '—'}
                tooltip="Namespace of the involved object"
              />
              <DetailRow
                label="UID"
                value={event.involvedObjectUid ?? '—'}
                tooltip="Unique identifier of the involved object"
                last
              />
            </DetailCard>

            <DetailCard title="Source information">
              <DetailRow
                label="Component"
                value={event.sourceComponent ?? '—'}
                tooltip="Kubernetes component that generated this event"
              />
              <DetailRow
                label="Host"
                value={event.sourceHost ?? '—'}
                tooltip="Host where the event was generated"
                last
              />
            </DetailCard>

            <DetailCard title="Timestamps">
              <DetailRow
                label="Created"
                value={formatTimestamp(event.creationTimestamp)}
                tooltip="When this event was first created"
              />
              <DetailRow
                label="First seen"
                value={formatTimestamp(event.firstTimestamp)}
                tooltip="When this event was first observed"
              />
              <DetailRow
                label="Last seen"
                value={formatTimestamp(event.lastTimestamp)}
                tooltip="When this event was last observed"
                last
              />
            </DetailCard>
          </div>

          <DetailSectionCard title="Event message">
            <pre className="paragraph-code-text text-fg-secondary py-2 break-all whitespace-pre-wrap">
              {event.message || 'No message available'}
            </pre>
          </DetailSectionCard>
        </div>
      </ScrollArea>
    </div>
  );
}

export default function EventDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="content-shell flex h-full w-full items-center justify-center">
          <span className="label-regular-primary text-fg-secondary">
            Loading...
          </span>
        </div>
      }>
      <EventDetailContent />
    </Suspense>
  );
}
