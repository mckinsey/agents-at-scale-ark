'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useGetEvents } from '@/lib/services/logs-hooks';

interface Props {
  readonly sessionId: string;
}

function getLogLevel(eventType: string): string {
  if (eventType.includes('Error')) return 'ERROR';
  if (eventType.includes('Complete')) return 'INFO';
  if (eventType.includes('Start')) return 'DEBUG';
  return 'INFO';
}

function getLogLevelVariant(level: string): 'default' | 'destructive' | 'secondary' {
  if (level === 'ERROR') return 'destructive';
  if (level === 'DEBUG') return 'secondary';
  return 'default';
}

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getEventSource(event: { reason: string; data: { operation?: string; queryName?: string } }): string {
  if (event.data.operation) {
    return `[${event.data.operation}]`;
  }
  if (event.data.queryName) {
    return `[${event.data.queryName}]`;
  }
  return `[${event.reason}]`;
}

interface LogRowProps {
  readonly event: {
    timestamp: string;
    eventType: string;
    reason: string;
    message: string;
    data: Record<string, unknown>;
  };
  readonly index: number;
}

function LogRow({ event, index }: LogRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const level = getLogLevel(event.eventType);
  const source = getEventSource(event);

  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-start gap-3 py-2 text-left transition-colors hover:bg-muted/50"
      >
        {isExpanded ? (
          <ChevronDown className="mt-0.5 h-3 w-3 flex-shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="mt-0.5 h-3 w-3 flex-shrink-0 text-muted-foreground" />
        )}
        <span className="whitespace-nowrap text-muted-foreground">
          {formatTimestamp(event.timestamp)}
        </span>
        <Badge variant={getLogLevelVariant(level)} className="shrink-0">
          {level}
        </Badge>
        <span className="text-muted-foreground">{source}</span>
        <span className="flex-1 truncate">{event.message}</span>
      </button>
      {isExpanded && (
        <div className="ml-6 space-y-2 pb-3 pl-3">
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">
              Message
            </div>
            <div className="rounded-md bg-muted p-2 text-sm">
              {event.message}
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">
              Event Data
            </div>
            <pre className="overflow-x-auto rounded-md bg-muted p-2 text-xs">
              {JSON.stringify(event.data, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export function LogsTab({ sessionId }: Props) {
  const { data, isLoading, error } = useGetEvents(sessionId);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading events...
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-destructive">
          Failed to load events
        </CardContent>
      </Card>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No events found for this session
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="font-mono text-sm">
          {data.items.map((event, index) => (
            <LogRow
              key={`${event.timestamp}-${index}`}
              event={event}
              index={index}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
