import { useCallback, useEffect, useState } from 'react';

import {
  EMPTY_LAYOUT,
  type SectionedLayout,
} from '@/lib/utils/section-layout';

const WORKFLOW_TEMPLATES_PREFIX = 'ark-dashboard:workflow-layout:';
const AGENTS_PREFIX = 'ark-dashboard:agents-layout:';
const TEAMS_PREFIX = 'ark-dashboard:teams-layout:';

export function parseLayout(raw: unknown): SectionedLayout {
  if (!raw || typeof raw !== 'object') return EMPTY_LAYOUT;
  const candidate = raw as Partial<SectionedLayout> & {
    sections?: unknown[];
  };
  const sections = Array.isArray(candidate.sections)
    ? candidate.sections.flatMap(s => {
        if (!s || typeof s !== 'object') return [];
        const { id, name, description, itemKeys } = s as unknown as Record<
          string,
          unknown
        >;
        if (typeof id !== 'string' || typeof name !== 'string') return [];
        const keys = Array.isArray(itemKeys)
          ? itemKeys.filter((v): v is string => typeof v === 'string')
          : [];
        return [
          {
            id,
            name,
            description:
              typeof description === 'string' ? description : undefined,
            itemKeys: keys,
          },
        ];
      })
    : [];
  const ungroupedOrder = Array.isArray(candidate.ungroupedOrder)
    ? candidate.ungroupedOrder.filter(
        (v): v is string => typeof v === 'string',
      )
    : [];
  return { sections, ungroupedOrder };
}

interface ResourceLayoutOptions {
  storagePrefix: string;
  namespace: string;
}

function readLayout({
  storagePrefix,
  namespace,
}: ResourceLayoutOptions): SectionedLayout {
  if (typeof window === 'undefined') return EMPTY_LAYOUT;
  try {
    const raw = window.localStorage.getItem(`${storagePrefix}${namespace}`);
    if (raw) return parseLayout(JSON.parse(raw));
  } catch {
    // fall through
  }
  return EMPTY_LAYOUT;
}

export interface UseResourceLayoutResult {
  layout: SectionedLayout;
  setLayout: (
    update:
      | SectionedLayout
      | ((current: SectionedLayout) => SectionedLayout),
  ) => void;
}

export function useResourceLayout({
  storagePrefix,
  namespace,
}: ResourceLayoutOptions): UseResourceLayoutResult {
  const [layout, setLayoutState] = useState<SectionedLayout>(EMPTY_LAYOUT);

  useEffect(() => {
    setLayoutState(readLayout({ storagePrefix, namespace }));
  }, [storagePrefix, namespace]);

  const setLayout = useCallback<UseResourceLayoutResult['setLayout']>(
    update => {
      setLayoutState(current => {
        const next =
          typeof update === 'function' ? update(current) : update;
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem(
              `${storagePrefix}${namespace}`,
              JSON.stringify(next),
            );
          } catch {
            // Quota exceeded or storage disabled — state still reflects the change.
          }
        }
        return next;
      });
    },
    [storagePrefix, namespace],
  );

  return { layout, setLayout };
}

export function useWorkflowsLayout(namespace: string) {
  return useResourceLayout({
    storagePrefix: WORKFLOW_TEMPLATES_PREFIX,
    namespace,
  });
}

export function useAgentsLayout(namespace: string) {
  return useResourceLayout({
    storagePrefix: AGENTS_PREFIX,
    namespace,
  });
}

export function useTeamsLayout(namespace: string) {
  return useResourceLayout({
    storagePrefix: TEAMS_PREFIX,
    namespace,
  });
}
