'use client';

import { useState } from 'react';

import { ChevronDown, ChevronRight } from '@/components/icons';
import { cn } from '@/lib/utils';

interface JsonTreeProps {
  data: unknown;
}

function JsonValue({ value }: { readonly value: unknown }) {
  if (typeof value === 'string') {
    return <span className="text-[#67e8f9]">&quot;{value}&quot;</span>;
  }
  if (value === null) {
    return <span className="text-fg-tertiary">null</span>;
  }
  return <span className="text-fg-primary">{String(value)}</span>;
}

interface JsonTreeNodeProps {
  readonly data: unknown;
  readonly keyName?: string;
  readonly path: string;
  readonly expandedPaths: Set<string>;
  readonly onToggle: (path: string) => void;
}

function JsonTreeNode({
  data,
  keyName,
  path,
  expandedPaths,
  onToggle,
}: JsonTreeNodeProps) {
  const isArray = Array.isArray(data);
  const isObject = !isArray && data !== null && typeof data === 'object';

  if (!isArray && !isObject) {
    return (
      <div className="flex items-center gap-1 p-2">
        {keyName !== undefined && (
          <span className="text-fg-secondary">{keyName}:</span>
        )}
        <JsonValue value={data} />
      </div>
    );
  }

  const entries: [string, unknown][] = isArray
    ? (data as unknown[]).map((value, index) => [String(index), value])
    : Object.entries(data as Record<string, unknown>);
  const count = entries.length;
  const summary = isArray
    ? `[${count}]`
    : `{ ${count} ${count === 1 ? 'key' : 'keys'} }`;
  const isExpanded = expandedPaths.has(path);

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => onToggle(path)}
        className={cn(
          'flex w-full items-center gap-2 p-2 text-left transition-colors',
          isExpanded
            ? 'bg-stateslayer-overlay-pressed text-fg-primary'
            : 'text-fg-secondary hover:bg-stateslayer-overlay-hover',
        )}>
        <span className="text-fg-secondary flex size-6 shrink-0 items-center justify-center">
          {isExpanded ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
        </span>
        <span className="truncate">
          {keyName !== undefined && <span>{keyName} </span>}
          {summary}
        </span>
      </button>
      {isExpanded && (
        <div className="flex flex-col pl-2">
          {entries.map(([key, value]) => (
            <div key={key} className="flex items-start">
              {/* subtle connector rail: vertical + horizontal tick */}
              <div className="relative w-4 shrink-0 self-stretch">
                <span className="border-stroke-divider absolute inset-y-0 left-0 border-l" />
                <span className="border-stroke-divider absolute top-5 left-0 w-full border-t" />
              </div>
              {/* thicker vertical-only rail + row content */}
              <div className="border-stroke-secondary min-w-0 flex-1 border-l-2">
                <JsonTreeNode
                  data={value}
                  keyName={isArray ? undefined : key}
                  path={`${path}.${key}`}
                  expandedPaths={expandedPaths}
                  onToggle={onToggle}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function JsonTree({ data }: JsonTreeProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    () => new Set(['root']),
  );

  const handleToggle = (path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  return (
    <div className="text-sm">
      <JsonTreeNode
        data={data}
        path="root"
        expandedPaths={expandedPaths}
        onToggle={handleToggle}
      />
    </div>
  );
}
