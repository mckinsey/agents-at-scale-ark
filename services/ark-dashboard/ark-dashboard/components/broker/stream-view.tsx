'use client';

import {
  StreamPanel,
  StreamPlaceholder,
  StreamRow,
  useStreamPanelState,
} from '@/components/broker/stream-panel';
import { Button } from '@/components/ui/button';
import { type StreamEntry } from '@/lib/utils/sse-stream';

const summaryCache = new WeakMap<object, string>();

function summarise(data: unknown): string {
  if (data === null || typeof data !== 'object') {
    return JSON.stringify(data);
  }
  const cached = summaryCache.get(data);
  if (cached !== undefined) {
    return cached;
  }
  const summary = JSON.stringify(data);
  summaryCache.set(data, summary);
  return summary;
}

interface StreamViewProps {
  readonly title: string;
  readonly entries: StreamEntry[];
  readonly isConnected: boolean;
  readonly isLoading?: boolean;
  readonly hasMore?: boolean;
  readonly error: string | null;
  readonly onPurge: () => void;
  readonly onLoadMore?: () => void;
}

export function StreamView({
  title,
  entries,
  isConnected,
  isLoading,
  hasMore,
  error,
  onPurge,
  onLoadMore,
}: Readonly<StreamViewProps>) {
  const {
    autoScroll,
    setAutoScroll,
    expandedIds,
    toggleExpanded,
    containerRef,
  } = useStreamPanelState(entries[0]?.id, entries.length);

  return (
    <StreamPanel
      title={title}
      isConnected={isConnected}
      autoScroll={autoScroll}
      onAutoScrollChange={setAutoScroll}
      onPurge={onPurge}
      containerRef={containerRef}
      error={error}>
      {entries.length === 0 ? (
        <StreamPlaceholder />
      ) : (
        <>
          {entries.map(entry => {
            const isExpanded = expandedIds.has(entry.id);
            return (
              <StreamRow
                key={entry.id}
                rowId={entry.id}
                label="entry"
                isExpanded={isExpanded}
                onToggle={toggleExpanded}
                timestamp={entry.timestamp}
                summary={isExpanded ? undefined : summarise(entry.data)}
                payload={entry.data}
              />
            );
          })}
          {onLoadMore && hasMore && (
            <div className="flex justify-center py-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onLoadMore}
                disabled={isLoading}>
                {isLoading ? 'Loading...' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}
    </StreamPanel>
  );
}
