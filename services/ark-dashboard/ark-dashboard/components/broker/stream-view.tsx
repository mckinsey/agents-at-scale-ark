'use client';

import {
  StreamPanel,
  StreamPlaceholder,
  StreamRow,
  useStreamPanelState,
} from '@/components/broker/stream-panel';
import { Button } from '@/components/ui/button';
import { type StreamEntry } from '@/lib/utils/sse-stream';

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
  } = useStreamPanelState(entries);

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
                label="entry"
                isExpanded={isExpanded}
                onToggle={() => toggleExpanded(entry.id)}
                timestamp={entry.timestamp}
                summary={isExpanded ? undefined : JSON.stringify(entry.data)}
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
