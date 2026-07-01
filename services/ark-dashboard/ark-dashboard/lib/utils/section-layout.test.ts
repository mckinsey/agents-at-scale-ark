import { describe, expect, it } from 'vitest';

import {
  UNGROUPED_KEY,
  applyLayout,
  createSection,
  deleteSection,
  layoutEqual,
  moveRow,
  moveSection,
  toLayout,
  updateSection,
  type SectionedLayout,
} from './section-layout';

interface TestItem {
  id: string;
}

const item = (id: string): TestItem => ({ id });
const getKey = (t: TestItem) => t.id;

const layout = (
  sections: SectionedLayout['sections'],
  ungroupedOrder: SectionedLayout['ungroupedOrder'] = [],
): SectionedLayout => ({ sections, ungroupedOrder });

describe('applyLayout', () => {
  it('renders ungrouped only when layout has no sections', () => {
    const items = [item('a'), item('b')];
    const result = applyLayout(items, layout([]), getKey);
    expect(result.sections).toEqual([]);
    expect(result.ungrouped.map(getKey)).toEqual(['a', 'b']);
  });

  it('places items into sections in itemKeys order', () => {
    const items = [item('a'), item('b'), item('c'), item('d')];
    const result = applyLayout(
      items,
      layout([
        { id: 's1', name: 'S1', itemKeys: ['c', 'a'] },
        { id: 's2', name: 'S2', itemKeys: ['b'] },
      ]),
      getKey,
    );
    expect(result.sections[0].items.map(getKey)).toEqual(['c', 'a']);
    expect(result.sections[1].items.map(getKey)).toEqual(['b']);
    expect(result.ungrouped.map(getKey)).toEqual(['d']);
  });

  it('appends unknown items to ungrouped after the saved ungroupedOrder', () => {
    const items = [item('a'), item('b'), item('c')];
    const result = applyLayout(items, layout([], ['b']), getKey);
    expect(result.ungrouped.map(getKey)).toEqual(['b', 'a', 'c']);
  });

  it('drops stale keys that are no longer in items', () => {
    const items = [item('a')];
    const result = applyLayout(
      items,
      layout(
        [{ id: 's1', name: 'S1', itemKeys: ['gone', 'a'] }],
        ['also-gone'],
      ),
      getKey,
    );
    expect(result.sections[0].items.map(getKey)).toEqual(['a']);
    expect(result.ungrouped).toEqual([]);
  });

  it('deduplicates when a key appears in multiple places (section wins)', () => {
    const items = [item('a'), item('b')];
    const result = applyLayout(
      items,
      layout([{ id: 's1', name: 'S1', itemKeys: ['a'] }], ['a', 'b']),
      getKey,
    );
    expect(result.sections[0].items.map(getKey)).toEqual(['a']);
    expect(result.ungrouped.map(getKey)).toEqual(['b']);
  });

  it('works with an arbitrary key extractor', () => {
    interface Weird {
      meta: { slug: string };
    }
    const items: Weird[] = [{ meta: { slug: 'x' } }, { meta: { slug: 'y' } }];
    const result = applyLayout(
      items,
      layout([{ id: 's', name: 'S', itemKeys: ['y'] }]),
      w => w.meta.slug,
    );
    expect(result.sections[0].items.map(w => w.meta.slug)).toEqual(['y']);
    expect(result.ungrouped.map(w => w.meta.slug)).toEqual(['x']);
  });
});

describe('moveRow', () => {
  const base = layout(
    [
      { id: 's1', name: 'S1', itemKeys: ['a', 'b', 'c'] },
      { id: 's2', name: 'S2', itemKeys: ['x', 'y'] },
    ],
    ['u1', 'u2'],
  );

  it('reorders within a section', () => {
    const next = moveRow(base, 's1', 0, 's1', 2);
    expect(next.sections[0].itemKeys).toEqual(['b', 'c', 'a']);
  });

  it('reorders within ungrouped', () => {
    const next = moveRow(base, UNGROUPED_KEY, 1, UNGROUPED_KEY, 0);
    expect(next.ungroupedOrder).toEqual(['u2', 'u1']);
  });

  it('moves a row from one section to another', () => {
    const next = moveRow(base, 's1', 1, 's2', 0);
    expect(next.sections[0].itemKeys).toEqual(['a', 'c']);
    expect(next.sections[1].itemKeys).toEqual(['b', 'x', 'y']);
  });

  it('moves a row from section into ungrouped', () => {
    const next = moveRow(base, 's1', 0, UNGROUPED_KEY, 1);
    expect(next.sections[0].itemKeys).toEqual(['b', 'c']);
    expect(next.ungroupedOrder).toEqual(['u1', 'a', 'u2']);
  });

  it('moves a row from ungrouped into a section', () => {
    const next = moveRow(base, UNGROUPED_KEY, 0, 's2', 1);
    expect(next.ungroupedOrder).toEqual(['u2']);
    expect(next.sections[1].itemKeys).toEqual(['x', 'u1', 'y']);
  });

  it('clamps toIndex to the target list length', () => {
    const next = moveRow(base, 's1', 0, 's2', 99);
    expect(next.sections[1].itemKeys).toEqual(['x', 'y', 'a']);
  });

  it('leaves layout unchanged when source index is out of range', () => {
    const next = moveRow(base, 's1', 10, 's2', 0);
    expect(next).toEqual(base);
  });
});

describe('moveSection', () => {
  const base = layout([
    { id: 's1', name: 'S1', itemKeys: [] },
    { id: 's2', name: 'S2', itemKeys: [] },
    { id: 's3', name: 'S3', itemKeys: [] },
  ]);

  it('moves a section downward', () => {
    const next = moveSection(base, 0, 2);
    expect(next.sections.map(s => s.id)).toEqual(['s2', 's3', 's1']);
  });

  it('moves a section upward', () => {
    const next = moveSection(base, 2, 0);
    expect(next.sections.map(s => s.id)).toEqual(['s3', 's1', 's2']);
  });

  it('is a no-op when indices are equal or out of range', () => {
    expect(moveSection(base, 1, 1)).toEqual(base);
    expect(moveSection(base, -1, 0)).toEqual(base);
    expect(moveSection(base, 0, 99)).toEqual(base);
  });
});

describe('createSection', () => {
  it('appends a new empty section', () => {
    const next = createSection(layout([]), {
      id: 'new',
      name: 'New',
      description: 'desc',
    });
    expect(next.sections).toEqual([
      { id: 'new', name: 'New', description: 'desc', itemKeys: [] },
    ]);
  });
});

describe('updateSection', () => {
  it('patches name and description leaving itemKeys intact', () => {
    const base = layout([
      {
        id: 's1',
        name: 'Old',
        description: 'old-desc',
        itemKeys: ['a'],
      },
    ]);
    const next = updateSection(base, 's1', {
      name: 'New',
      description: 'new-desc',
    });
    expect(next.sections[0]).toEqual({
      id: 's1',
      name: 'New',
      description: 'new-desc',
      itemKeys: ['a'],
    });
  });

  it('allows clearing the description with empty string', () => {
    const base = layout([
      { id: 's1', name: 'S1', description: 'desc', itemKeys: [] },
    ]);
    const next = updateSection(base, 's1', { description: '' });
    expect(next.sections[0].description).toBe('');
  });
});

describe('toLayout', () => {
  it('extracts sections + ungrouped keys from a rendered layout', () => {
    const items = [item('a'), item('b'), item('c')];
    const rendered = applyLayout(
      items,
      layout([{ id: 's1', name: 'S1', itemKeys: ['b'] }], ['c']),
      getKey,
    );
    expect(toLayout(rendered, getKey)).toEqual({
      sections: [
        {
          id: 's1',
          name: 'S1',
          description: undefined,
          itemKeys: ['b'],
        },
      ],
      ungroupedOrder: ['c', 'a'],
    });
  });
});

describe('layoutEqual', () => {
  const mkLayout = (): SectionedLayout => ({
    sections: [
      { id: 's1', name: 'S1', description: 'd', itemKeys: ['a', 'b'] },
    ],
    ungroupedOrder: ['c'],
  });

  it('returns true for referentially equal layouts', () => {
    const l = mkLayout();
    expect(layoutEqual(l, l)).toBe(true);
  });

  it('returns true for structurally equal layouts', () => {
    expect(layoutEqual(mkLayout(), mkLayout())).toBe(true);
  });

  it('detects section order differences', () => {
    const a: SectionedLayout = {
      sections: [
        { id: 's1', name: 'S1', itemKeys: [] },
        { id: 's2', name: 'S2', itemKeys: [] },
      ],
      ungroupedOrder: [],
    };
    const b: SectionedLayout = {
      sections: [
        { id: 's2', name: 'S2', itemKeys: [] },
        { id: 's1', name: 'S1', itemKeys: [] },
      ],
      ungroupedOrder: [],
    };
    expect(layoutEqual(a, b)).toBe(false);
  });

  it('detects itemKeys differences', () => {
    const a = mkLayout();
    const b = mkLayout();
    (b.sections as unknown as [{ itemKeys: string[] }])[0].itemKeys = [
      'a',
      'c',
    ];
    expect(layoutEqual(a, b)).toBe(false);
  });

  it('detects ungrouped order differences', () => {
    const a = mkLayout();
    const b: SectionedLayout = { ...a, ungroupedOrder: ['d'] };
    expect(layoutEqual(a, b)).toBe(false);
  });

  it('detects section name or description changes', () => {
    const a = mkLayout();
    const b1: SectionedLayout = {
      ...a,
      sections: [{ ...a.sections[0], name: 'NEW' }],
    };
    const b2: SectionedLayout = {
      ...a,
      sections: [{ ...a.sections[0], description: 'NEW' }],
    };
    expect(layoutEqual(a, b1)).toBe(false);
    expect(layoutEqual(a, b2)).toBe(false);
  });
});

describe('deleteSection', () => {
  it('removes the section and returns its items to ungrouped at the end', () => {
    const base = layout(
      [
        { id: 's1', name: 'S1', itemKeys: ['a', 'b'] },
        { id: 's2', name: 'S2', itemKeys: ['c'] },
      ],
      ['u1'],
    );
    const next = deleteSection(base, 's1');
    expect(next.sections.map(s => s.id)).toEqual(['s2']);
    expect(next.ungroupedOrder).toEqual(['u1', 'a', 'b']);
  });

  it('is a no-op when the section id is unknown', () => {
    const base = layout([{ id: 's1', name: 'S1', itemKeys: [] }]);
    expect(deleteSection(base, 'missing')).toEqual(base);
  });
});
