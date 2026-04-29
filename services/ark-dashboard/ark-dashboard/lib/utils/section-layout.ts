function moveItem(
  keys: readonly string[],
  fromIndex: number,
  toIndex: number,
): string[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= keys.length ||
    toIndex >= keys.length
  ) {
    return [...keys];
  }
  const next = [...keys];
  const [removed] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, removed);
  return next;
}

export interface LayoutSection {
  id: string;
  name: string;
  description?: string;
  itemKeys: readonly string[];
}

export interface SectionedLayout {
  sections: readonly LayoutSection[];
  ungroupedOrder: readonly string[];
}

export const UNGROUPED_KEY = 'ungrouped';
export const EMPTY_LAYOUT: SectionedLayout = {
  sections: [],
  ungroupedOrder: [],
};

export interface RenderedSection<T> {
  section: LayoutSection;
  items: T[];
}

export interface RenderedLayout<T> {
  sections: RenderedSection<T>[];
  ungrouped: T[];
}

export function toLayout<T>(
  rendered: RenderedLayout<T>,
  getKey: (item: T) => string,
): SectionedLayout {
  return {
    sections: rendered.sections.map(rs => ({
      ...rs.section,
      itemKeys: rs.items.map(getKey),
    })),
    ungroupedOrder: rendered.ungrouped.map(getKey),
  };
}

export function layoutEqual(a: SectionedLayout, b: SectionedLayout): boolean {
  if (a === b) return true;
  if (a.sections.length !== b.sections.length) return false;
  if (a.ungroupedOrder.length !== b.ungroupedOrder.length) return false;
  for (let i = 0; i < a.sections.length; i++) {
    const sa = a.sections[i];
    const sb = b.sections[i];
    if (
      sa.id !== sb.id ||
      sa.name !== sb.name ||
      sa.description !== sb.description ||
      sa.itemKeys.length !== sb.itemKeys.length
    ) {
      return false;
    }
    for (let j = 0; j < sa.itemKeys.length; j++) {
      if (sa.itemKeys[j] !== sb.itemKeys[j]) return false;
    }
  }
  for (let i = 0; i < a.ungroupedOrder.length; i++) {
    if (a.ungroupedOrder[i] !== b.ungroupedOrder[i]) return false;
  }
  return true;
}

export function applyLayout<T>(
  items: readonly T[],
  layout: SectionedLayout,
  getKey: (item: T) => string,
): RenderedLayout<T> {
  const byKey = new Map(items.map(item => [getKey(item), item]));
  const placed = new Set<string>();

  const sections: RenderedSection<T>[] = layout.sections.map(section => {
    const grouped: T[] = [];
    for (const key of section.itemKeys) {
      const item = byKey.get(key);
      if (item && !placed.has(key)) {
        grouped.push(item);
        placed.add(key);
      }
    }
    return { section, items: grouped };
  });

  const ungrouped: T[] = [];
  for (const key of layout.ungroupedOrder) {
    const item = byKey.get(key);
    if (item && !placed.has(key)) {
      ungrouped.push(item);
      placed.add(key);
    }
  }
  for (const item of items) {
    const key = getKey(item);
    if (!placed.has(key)) {
      ungrouped.push(item);
      placed.add(key);
    }
  }

  return { sections, ungrouped };
}

function keysInGroup(
  layout: SectionedLayout,
  groupKey: string,
): readonly string[] {
  if (groupKey === UNGROUPED_KEY) return layout.ungroupedOrder;
  const section = layout.sections.find(s => s.id === groupKey);
  return section?.itemKeys ?? [];
}

function withKeysInGroup(
  layout: SectionedLayout,
  groupKey: string,
  keys: readonly string[],
): SectionedLayout {
  if (groupKey === UNGROUPED_KEY) {
    return { ...layout, ungroupedOrder: keys };
  }
  return {
    ...layout,
    sections: layout.sections.map(s =>
      s.id === groupKey ? { ...s, itemKeys: keys } : s,
    ),
  };
}

export function moveRow(
  layout: SectionedLayout,
  fromKey: string,
  fromIndex: number,
  toKey: string,
  toIndex: number,
): SectionedLayout {
  if (fromKey === toKey) {
    const keys = keysInGroup(layout, fromKey);
    return withKeysInGroup(layout, fromKey, moveItem(keys, fromIndex, toIndex));
  }
  const sourceKeys = [...keysInGroup(layout, fromKey)];
  if (fromIndex < 0 || fromIndex >= sourceKeys.length) return layout;
  const [removed] = sourceKeys.splice(fromIndex, 1);
  const targetKeys = [...keysInGroup(layout, toKey)];
  const clampedTo = Math.max(0, Math.min(toIndex, targetKeys.length));
  targetKeys.splice(clampedTo, 0, removed);

  const nextSections = layout.sections.map(s => {
    if (s.id === fromKey) return { ...s, itemKeys: sourceKeys };
    if (s.id === toKey) return { ...s, itemKeys: targetKeys };
    return s;
  });

  const nextUngrouped =
    fromKey === UNGROUPED_KEY
      ? sourceKeys
      : toKey === UNGROUPED_KEY
        ? targetKeys
        : layout.ungroupedOrder;

  return { sections: nextSections, ungroupedOrder: nextUngrouped };
}

export function moveSection(
  layout: SectionedLayout,
  fromIndex: number,
  toIndex: number,
): SectionedLayout {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= layout.sections.length ||
    toIndex >= layout.sections.length
  ) {
    return layout;
  }
  const next = [...layout.sections];
  const [removed] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, removed);
  return { ...layout, sections: next };
}

export function createSection(
  layout: SectionedLayout,
  section: { id: string; name: string; description?: string },
): SectionedLayout {
  return {
    ...layout,
    sections: [
      ...layout.sections,
      {
        id: section.id,
        name: section.name,
        description: section.description,
        itemKeys: [],
      },
    ],
  };
}

export function updateSection(
  layout: SectionedLayout,
  id: string,
  patch: { name?: string; description?: string },
): SectionedLayout {
  return {
    ...layout,
    sections: layout.sections.map(s =>
      s.id === id
        ? {
            ...s,
            name: patch.name ?? s.name,
            description:
              patch.description !== undefined
                ? patch.description
                : s.description,
          }
        : s,
    ),
  };
}

export function deleteSection(
  layout: SectionedLayout,
  id: string,
): SectionedLayout {
  const target = layout.sections.find(s => s.id === id);
  if (!target) return layout;
  return {
    sections: layout.sections.filter(s => s.id !== id),
    ungroupedOrder: [...layout.ungroupedOrder, ...target.itemKeys],
  };
}
