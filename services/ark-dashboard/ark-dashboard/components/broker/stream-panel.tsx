'use client';

import {
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { ChevronDown, ChevronRight } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export function useStreamPanelState(
  topRowId: string | undefined,
  rowCount: number,
) {
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const previousRowCountRef = useRef(rowCount);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [topRowId, rowCount, autoScroll]);

  useEffect(() => {
    const hasShrunk = rowCount < previousRowCountRef.current;
    previousRowCountRef.current = rowCount;
    if (hasShrunk) {
      setExpandedIds(prev => (prev.size > 0 ? new Set() : prev));
    }
  }, [rowCount]);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  return {
    autoScroll,
    setAutoScroll,
    expandedIds,
    toggleExpanded,
    containerRef,
  };
}

interface StreamPanelProps {
  readonly title: string;
  readonly isConnected: boolean;
  readonly autoScroll: boolean;
  readonly onAutoScrollChange: (next: boolean) => void;
  readonly onPurge: () => void;
  readonly containerRef: React.RefObject<HTMLDivElement | null>;
  readonly error?: string | null;
  readonly children: ReactNode;
}

export function StreamPanel({
  title,
  isConnected,
  autoScroll,
  onAutoScrollChange,
  onPurge,
  containerRef,
  error,
  children,
}: Readonly<StreamPanelProps>) {
  const switchId = useId();
  const [isPurgeDialogOpen, setIsPurgeDialogOpen] = useState(false);

  return (
    <div className="border-stroke-divider flex min-h-0 flex-1 flex-col gap-2 border p-5">
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="headings-h4-regular text-fg-primary">{title}</span>
          <span
            aria-hidden
            className={cn(
              'size-2 rounded-full',
              isConnected ? 'bg-status-success' : 'bg-fg-disabled',
            )}
          />
          <span className="sr-only">
            {isConnected
              ? `${title} stream connected`
              : `${title} stream disconnected`}
          </span>
        </div>
        <div className="flex items-center justify-end gap-5">
          <Button
            variant="outline"
            size="sm"
            className="text-fg-secondary border-[0.5px]"
            onClick={() => setIsPurgeDialogOpen(true)}>
            Purge
          </Button>
          <ConfirmationDialog
            open={isPurgeDialogOpen}
            onOpenChange={setIsPurgeDialogOpen}
            title={`Purge ${title}?`}
            description={`This permanently deletes every ${title} record held by the broker for this memory. This cannot be undone.`}
            confirmText="Purge"
            onConfirm={onPurge}
          />
          <div className="flex items-center gap-3">
            <Switch
              id={switchId}
              size="lg"
              checked={autoScroll}
              onCheckedChange={onAutoScrollChange}
            />
            <Label
              htmlFor={switchId}
              className="label-regular-primary text-fg-primary">
              Auto-scroll
            </Label>
          </div>
        </div>
      </div>
      {error && (
        <div
          role="alert"
          className="border-status-error text-status-error label-regular-primary border p-2">
          {error}
        </div>
      )}
      <div
        ref={containerRef}
        className="flex min-h-0 w-full flex-1 flex-col gap-2 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

export function StreamPlaceholder() {
  return (
    <div className="label-regular-primary text-fg-secondary flex items-center justify-center py-10">
      Waiting for data...
    </div>
  );
}

interface StreamRowProps {
  readonly rowId: string;
  /** Noun used to build the expander's accessible name, e.g. "entry". */
  readonly label: string;
  readonly isExpanded: boolean;
  readonly onToggle: (rowId: string) => void;
  readonly timestamp?: string;
  /** Inline preview beside the timestamp; omit to hide. */
  readonly summary?: ReactNode;
  readonly payload: unknown;
}

export const StreamRow = memo(function StreamRow({
  rowId,
  label,
  isExpanded,
  onToggle,
  timestamp,
  summary,
  payload,
}: Readonly<StreamRowProps>) {
  return (
    <div className="w-full">
      <Button
        variant="ghost"
        size="default"
        className="h-auto w-full min-w-0 justify-start pr-5 text-left"
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${label}${
          timestamp ? ` ${timestamp}` : ''
        }`}
        onClick={() => onToggle(rowId)}>
        <IconShell size="default" variant="secondary" className="shrink-0">
          {isExpanded ? <ChevronDown /> : <ChevronRight />}
        </IconShell>
        {timestamp && (
          <span className="label-regular-primary text-fg-secondary shrink-0">
            {timestamp}
          </span>
        )}
        {summary !== undefined && (
          <span className="label-regular-primary text-fg-tertiary min-w-0 flex-1 truncate">
            {summary}
          </span>
        )}
      </Button>
      {isExpanded && (
        <pre className="paragraph-code-text text-fg-secondary px-2 pb-2 pl-9 break-all whitespace-pre-wrap">
          {JSON.stringify(payload, null, 2)}
        </pre>
      )}
    </div>
  );
});
