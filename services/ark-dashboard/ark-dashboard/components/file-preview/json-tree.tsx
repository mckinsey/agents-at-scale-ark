'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface JsonTreeProps {
  data: unknown;
}

interface JsonTreeNodeProps {
  data: unknown;
  path: string;
  keyName?: string;
  level: number;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
}

function JsonTreeNode({
  data,
  path,
  keyName,
  level,
  expandedPaths,
  onToggle,
}: JsonTreeNodeProps) {
  const isExpanded = expandedPaths.has(path);
  const indent = level * 16;

  const toggle = () => {
    onToggle(path);
  };

  if (data === null) {
    return (
      <div style={{ paddingLeft: `${indent}px` }} className="py-0.5">
        {keyName && (
          <span className="text-blue-600 dark:text-blue-400">{keyName}: </span>
        )}
        <span className="text-gray-500 dark:text-gray-400">null</span>
      </div>
    );
  }

  if (typeof data === 'string') {
    return (
      <div style={{ paddingLeft: `${indent}px` }} className="py-0.5">
        {keyName && (
          <span className="text-blue-600 dark:text-blue-400">{keyName}: </span>
        )}
        <span className="text-green-600 dark:text-green-400">
          &quot;{data}&quot;
        </span>
      </div>
    );
  }

  if (typeof data === 'number') {
    return (
      <div style={{ paddingLeft: `${indent}px` }} className="py-0.5">
        {keyName && (
          <span className="text-blue-600 dark:text-blue-400">{keyName}: </span>
        )}
        <span className="text-purple-600 dark:text-purple-400">{data}</span>
      </div>
    );
  }

  if (typeof data === 'boolean') {
    return (
      <div style={{ paddingLeft: `${indent}px` }} className="py-0.5">
        {keyName && (
          <span className="text-blue-600 dark:text-blue-400">{keyName}: </span>
        )}
        <span className="text-orange-600 dark:text-orange-400">
          {String(data)}
        </span>
      </div>
    );
  }

  if (Array.isArray(data)) {
    return (
      <div>
        <div
          style={{ paddingLeft: `${indent}px` }}
          className="flex cursor-pointer items-center gap-1 py-0.5 hover:bg-gray-100 dark:hover:bg-gray-800"
          onClick={toggle}>
          {isExpanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          {keyName && (
            <span className="text-blue-600 dark:text-blue-400">
              {keyName}:{' '}
            </span>
          )}
          <span className="text-gray-600 dark:text-gray-400">
            [{data.length}]
          </span>
        </div>
        {isExpanded && (
          <div>
            {data.map((item, index) => (
              <JsonTreeNode
                key={index}
                data={item}
                path={`${path}[${index}]`}
                level={level + 1}
                expandedPaths={expandedPaths}
                onToggle={onToggle}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data);
    return (
      <div>
        <div
          style={{ paddingLeft: `${indent}px` }}
          className="flex cursor-pointer items-center gap-1 py-0.5 hover:bg-gray-100 dark:hover:bg-gray-800"
          onClick={toggle}>
          {isExpanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          {keyName && (
            <span className="text-blue-600 dark:text-blue-400">
              {keyName}:{' '}
            </span>
          )}
          <span className="text-gray-600 dark:text-gray-400">
            {'{'} {entries.length} {entries.length === 1 ? 'key' : 'keys'} {'}'}
          </span>
        </div>
        {isExpanded && (
          <div>
            {entries.map(([key, value]) => (
              <JsonTreeNode
                key={key}
                data={value}
                path={`${path}.${key}`}
                keyName={key}
                level={level + 1}
                expandedPaths={expandedPaths}
                onToggle={onToggle}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ paddingLeft: `${indent}px` }} className="py-0.5">
      {keyName && (
        <span className="text-blue-600 dark:text-blue-400">{keyName}: </span>
      )}
      <span>{String(data)}</span>
    </div>
  );
}

export function JsonTree({ data }: JsonTreeProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

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
    <div className="rounded-md border border-gray-200 bg-white p-4 font-mono text-sm dark:border-gray-800 dark:bg-gray-900">
      <JsonTreeNode
        data={data}
        path="root"
        level={0}
        expandedPaths={expandedPaths}
        onToggle={handleToggle}
      />
    </div>
  );
}
