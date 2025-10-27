'use client';

import { useParams, useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { BreadcrumbElement } from '@/components/common/page-header';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Event } from '@/lib/services/events';
import { eventsService } from '@/lib/services/events';

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: 'ARK Dashboard' },
  { href: '/events', label: 'Events' },
];

// Reusable styles for table field headings
const FIELD_HEADING_STYLES =
  'px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 w-1/3 text-left';

interface EventFieldProps {
  readonly label: string;
  readonly value: string | number | undefined | null;
  readonly tooltip?: string;
}

function EventField({ label, value, tooltip }: EventFieldProps) {
  return (
    <tr className="border-b border-gray-100 dark:border-gray-800">
      <td className={FIELD_HEADING_STYLES}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger className="cursor-help text-left" tabIndex={-1}>
              {label}
            </TooltipTrigger>
            <TooltipContent>
              <p>{tooltip ?? label}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </td>
      <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
        {value ?? '—'}
      </td>
    </tr>
  );
}

function EventTimestampField({ label, value, tooltip }: EventFieldProps) {
  const formatTimestamp = (timestamp: string | undefined | null) => {
    if (!timestamp) return '—';
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return timestamp;
    }
  };

  return (
    <tr className="border-b border-gray-100 dark:border-gray-800">
      <td className={FIELD_HEADING_STYLES}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger className="cursor-help text-left" tabIndex={-1}>
              {label}
            </TooltipTrigger>
            <TooltipContent>
              <p>{tooltip ?? label}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </td>
      <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
        {formatTimestamp(value as string)}
      </td>
    </tr>
  );
}

function EventTypeField({ label, value, tooltip }: EventFieldProps) {
  const getTypeColor = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'warning':
        return 'text-red-600 dark:text-red-400';
      case 'normal':
        return 'text-green-600 dark:text-green-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  return (
    <tr className="border-b border-gray-100 dark:border-gray-800">
      <td className={FIELD_HEADING_STYLES}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger className="cursor-help text-left" tabIndex={-1}>
              {label}
            </TooltipTrigger>
            <TooltipContent>
              <p>{tooltip ?? label}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </td>
      <td
        className={`px-3 py-2 text-xs font-medium ${getTypeColor(
          value as string,
        )}`}>
        {value ?? '—'}
      </td>
    </tr>
  );
}

function EventDetailContent() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadEvent = async () => {
      try {
        const eventData = await eventsService.get(eventId);
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
  }, [eventId]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading event...</div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="mb-2 text-xl font-semibold">Event Not Found</h1>
          <Button variant="outline" onClick={() => router.back()}>
            ← Back to Events
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader breadcrumbs={breadcrumbs} currentPage={event.name} />
      <div className="flex h-full flex-col">
        {/* Event Details - Four Column Layout */}
        <div className="border-b bg-gray-50/30 px-4 py-3 dark:bg-gray-900/10">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            {/* Basic Information Column */}
            <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
              <div className="border-b bg-gray-100 px-3 py-2 dark:bg-gray-800">
                <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Basic Information
                </h3>
              </div>
              <table className="w-full table-fixed">
                <tbody>
                  <EventField
                    label="Name"
                    value={event.name}
                    tooltip="Unique identifier of the event"
                  />
                  <EventField
                    label="Namespace"
                    value={event.namespace}
                    tooltip="Kubernetes namespace containing the event"
                  />
                  <EventField
                    label="UID"
                    value={event.uid}
                    tooltip="Unique identifier assigned by Kubernetes"
                  />
                  <EventTypeField
                    label="Type"
                    value={event.type}
                    tooltip="Event type: Normal (informational) or Warning (error/issue)"
                  />
                  <EventField
                    label="Reason"
                    value={event.reason}
                    tooltip="Brief reason code for the event"
                  />
                  <EventField
                    label="Count"
                    value={event.count}
                    tooltip="Number of times this event has occurred"
                  />
                </tbody>
              </table>
            </div>

            {/* Involved Object Column */}
            <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
              <div className="border-b bg-gray-100 px-3 py-2 dark:bg-gray-800">
                <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Involved Object
                </h3>
              </div>
              <table className="w-full">
                <tbody>
                  <EventField
                    label="Kind"
                    value={event.involvedObjectKind}
                    tooltip="Type of Kubernetes resource (Agent, Team, Query, etc.)"
                  />
                  <EventField
                    label="Name"
                    value={event.involvedObjectName}
                    tooltip="Name of the resource that triggered this event"
                  />
                  <EventField
                    label="Namespace"
                    value={event.involvedObjectNamespace}
                    tooltip="Namespace of the involved object"
                  />
                  <EventField
                    label="UID"
                    value={event.involvedObjectUid}
                    tooltip="Unique identifier of the involved object"
                  />
                </tbody>
              </table>
            </div>

            {/* Source Information Column */}
            <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
              <div className="border-b bg-gray-100 px-3 py-2 dark:bg-gray-800">
                <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Source Information
                </h3>
              </div>
              <table className="w-full">
                <tbody>
                  <EventField
                    label="Component"
                    value={event.sourceComponent}
                    tooltip="Kubernetes component that generated this event"
                  />
                  <EventField
                    label="Host"
                    value={event.sourceHost}
                    tooltip="Host where the event was generated"
                  />
                </tbody>
              </table>
            </div>

            {/* Timestamps Column */}
            <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
              <div className="border-b bg-gray-100 px-3 py-2 dark:bg-gray-800">
                <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Timestamps
                </h3>
              </div>
              <table className="w-full">
                <tbody>
                  <EventTimestampField
                    label="Created"
                    value={event.creationTimestamp}
                    tooltip="When this event was first created"
                  />
                  <EventTimestampField
                    label="First Seen"
                    value={event.firstTimestamp}
                    tooltip="When this event was first observed"
                  />
                  <EventTimestampField
                    label="Last Seen"
                    value={event.lastTimestamp}
                    tooltip="When this event was last observed"
                  />
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Message Section */}
        <div className="flex min-h-0 flex-1 flex-col">
          <ScrollArea className="flex-1 p-3">
            <div className="space-y-3">
              {/* Message Table */}
              <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
                <div className="flex items-center justify-between border-b bg-gray-100 px-3 py-2 dark:bg-gray-800">
                  <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    Event Message
                  </h3>
                </div>
                <div className="p-3">
                  <pre className="rounded bg-gray-50 p-3 font-mono text-sm whitespace-pre-wrap text-gray-700 dark:bg-gray-900/50 dark:text-gray-300">
                    {event.message || 'No message available'}
                  </pre>
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>
      </div>
    </>
  );
}

export default function EventDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          Loading...
        </div>
      }>
      <EventDetailContent />
    </Suspense>
  );
}
