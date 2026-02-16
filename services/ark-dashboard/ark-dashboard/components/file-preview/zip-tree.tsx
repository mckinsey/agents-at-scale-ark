'use client';

import { ChevronDown, ChevronRight, File, Folder } from 'lucide-react';
import { useState } from 'react';

export interface ZipEntry {
  name: string;
  path: string;
  size: number;
  compressedSize: number;
  isDirectory: boolean;
  lastModified: string;
}

interface ZipTreeProps {
  entries: ZipEntry[];
}

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: TreeNode[];
  entry?: ZipEntry;
}

function buildTree(entries: ZipEntry[]): TreeNode[] {
  const root: TreeNode[] = [];
  const nodeMap = new Map<string, TreeNode>();

  // Sort entries to ensure directories come before their contents
  const sortedEntries = [...entries].sort((a, b) => {
    const aDepth = a.path.split('/').filter(Boolean).length;
    const bDepth = b.path.split('/').filter(Boolean).length;
    return aDepth - bDepth;
  });

  for (const entry of sortedEntries) {
    const parts = entry.path.split('/').filter(Boolean);
    let currentLevel = root;
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLastPart = i === parts.length - 1;

      let node = nodeMap.get(currentPath);
      if (!node) {
        node = {
          name: part,
          path: currentPath,
          isDirectory: isLastPart ? entry.isDirectory : true,
          children: [],
          entry: isLastPart ? entry : undefined,
        };
        nodeMap.set(currentPath, node);
        currentLevel.push(node);
      }

      if (!isLastPart) {
        currentLevel = node.children;
      }
    }
  }

  return root;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function TreeNodeComponent({
  node,
  level = 0,
}: {
  node: TreeNode;
  level?: number;
}) {
  const [expanded, setExpanded] = useState(level < 2);

  const handleToggle = () => {
    if (node.isDirectory) {
      setExpanded(!expanded);
    }
  };

  return (
    <div>
      <div
        className="flex cursor-pointer items-center gap-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800"
        style={{ paddingLeft: `${level * 20}px` }}
        onClick={handleToggle}>
        {node.isDirectory ? (
          <>
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <Folder className="h-4 w-4 text-blue-500" />
          </>
        ) : (
          <>
            <div className="w-4" />
            <File className="h-4 w-4 text-gray-500" />
          </>
        )}
        <span className="text-sm">{node.name}</span>
        {!node.isDirectory && node.entry && (
          <span className="mr-4 ml-auto text-xs text-gray-500">
            {formatFileSize(node.entry.size)}
          </span>
        )}
      </div>
      {node.isDirectory && expanded && (
        <div>
          {node.children.map((child, index) => (
            <TreeNodeComponent key={index} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ZipTree({ entries }: ZipTreeProps) {
  const tree = buildTree(entries);
  const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0);
  const totalCompressed = entries.reduce(
    (sum, entry) => sum + entry.compressedSize,
    0,
  );
  const compressionRatio =
    totalSize > 0 ? ((1 - totalCompressed / totalSize) * 100).toFixed(1) : '0';

  return (
    <div className="font-mono text-sm">
      <div className="mb-4 rounded bg-gray-100 p-2 dark:bg-gray-800">
        <div className="flex justify-between text-xs">
          <span>{entries.filter(e => !e.isDirectory).length} files</span>
          <span>{entries.filter(e => e.isDirectory).length} folders</span>
        </div>
        <div className="mt-1 flex justify-between text-xs">
          <span>Uncompressed: {formatFileSize(totalSize)}</span>
          <span>
            Compressed: {formatFileSize(totalCompressed)} ({compressionRatio}%
            savings)
          </span>
        </div>
      </div>
      <div>
        {tree.map((node, index) => (
          <TreeNodeComponent key={index} node={node} />
        ))}
      </div>
    </div>
  );
}
