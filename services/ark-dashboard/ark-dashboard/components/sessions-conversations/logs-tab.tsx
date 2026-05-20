'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useGetEvents } from '@/lib/services/logs-hooks';
import { logsService, type LogEvent } from '@/lib/services/logs';

interface Props {
  readonly sessionId: string;
}

function getLogLevel(eventType: string): string {
  if (eventType.includes('Error')) return 'ERROR';
  if (eventType.includes('Complete')) return 'INFO';
  if (eventType.includes('Start')) return 'DEBUG';
  return 'INFO';
}

function getLogLevelVariant(level: string): 'error' | 'alternative' | 'high-emphasis' {
  if (level === 'ERROR') return 'error';
  if (level === 'DEBUG') return 'alternative';
  return 'high-emphasis';
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
    <div className="border-b border-stroke-divider last:border-0">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full py-2 text-left transition-colors hover:bg-stateslayer-overlay-hover"
      >
        <ScrollArea className="w-full">
          <div className="flex items-start gap-3">
            {isExpanded ? (
              <ChevronDown className="mt-0.5 h-3 w-3 flex-shrink-0 text-fg-tertiary" />
            ) : (
              <ChevronRight className="mt-0.5 h-3 w-3 flex-shrink-0 text-fg-tertiary" />
            )}
            <span className="whitespace-nowrap text-fg-secondary text-xs font-normal leading-4">
              {formatTimestamp(event.timestamp)}
            </span>
            <Badge variant={getLogLevelVariant(level)} size="sm" className="shrink-0">
              {level}
            </Badge>
            <span className="whitespace-nowrap text-fg-tertiary text-xs font-normal leading-4">{source}</span>
            <span className="whitespace-nowrap text-fg-primary text-sm font-normal leading-5">{event.message}</span>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </button>
      {isExpanded && (
        <div className="ml-6 space-y-2 pb-3 pl-3">
          <div>
            <div className="mb-1 text-xs font-medium text-fg-secondary">
              Message
            </div>
            <ScrollArea className="w-full">
              <div className="bg-surface-bg-tertiary p-2 text-sm text-fg-primary whitespace-nowrap">
                {event.message}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-fg-secondary">
              Event Data
            </div>
            <ScrollArea className="w-full">
              <pre className="bg-surface-bg-tertiary p-2 text-xs text-fg-primary">
                {JSON.stringify(event.data, null, 2)}
              </pre>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  );
}

export function LogsTab({ sessionId }: Props) {
  const { data, isLoading, error } = useGetEvents(sessionId);
  const [additionalLogs, setAdditionalLogs] = useState<LogEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<number | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Update hasMore and cursor when initial data changes
  useEffect(() => {
    if (data) {
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor);
    }
  }, [data]);

  const handleLoadMore = async () => {
    if (!sessionId || isLoadingMore || nextCursor === undefined) return;

    setIsLoadingMore(true);
    try {
      const response = await logsService.getEvents(sessionId, 100, nextCursor);
      setAdditionalLogs(prev => [...prev, ...response.items]);
      setNextCursor(response.nextCursor);
      setHasMore(response.hasMore);
    } catch (err) {
      console.error('Failed to load more events:', err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-fg-secondary">
          Loading events...
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-stroke-status-error">
          Failed to load events
        </CardContent>
      </Card>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-fg-secondary">
          No events found for this session
        </CardContent>
      </Card>
    );
  }

  const allLogs = [...data.items, ...additionalLogs];

  return (
    <Card className="flex flex-1 flex-col">
      <CardContent className="flex flex-1 flex-col p-0">
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto px-6 py-3 font-mono text-sm">
          {allLogs.map((event, index) => (
            <LogRow
              key={`${event.timestamp}-${index}`}
              event={event}
              index={index}
            />
          ))}
          {hasMore && (
            <div className="flex justify-center py-4">
              <Button
                variant="outline"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? 'Loading...' : 'Load more'}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
