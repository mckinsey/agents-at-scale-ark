import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { PreviewTab } from '@/hooks/use-multi-file-preview';

import { MultiTabPreviewDialog } from './multi-tab-preview-dialog';

vi.mock('@/lib/api/files-client', () => ({
  FILES_API_BASE_URL: 'http://localhost:3000/api',
}));

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    parse: vi.fn(),
    render: vi.fn(),
  },
}));

function makeTab(overrides: Partial<PreviewTab> = {}): PreviewTab {
  return {
    key: 'scores.md',
    fileName: 'scores.md',
    content: '',
    imageUrl: null,
    isImage: false,
    language: null,
    jsonData: null,
    isJson: false,
    zipEntries: [],
    isZip: false,
    spreadsheetData: null,
    isSpreadsheet: false,
    isMarkdown: false,
    loading: false,
    ...overrides,
  };
}

function renderDialog(
  activeTab: PreviewTab | null,
  overrides: {
    tabs?: PreviewTab[];
    onTabClick?: (key: string) => void;
    onTabClose?: (key: string) => void;
  } = {},
) {
  const tabs = overrides.tabs ?? (activeTab ? [activeTab] : []);
  return render(
    <MultiTabPreviewDialog
      open={true}
      onOpenChange={() => {}}
      tabs={tabs}
      activeTab={activeTab}
      activeTabKey={activeTab?.key ?? null}
      onTabClick={overrides.onTabClick ?? (() => {})}
      onTabClose={overrides.onTabClose ?? (() => {})}
      onCloseAll={() => {}}
    />,
  );
}

describe('MultiTabPreviewDialog', () => {
  it('renders a tab per open file', () => {
    const a = makeTab({ key: 'a.txt', fileName: 'a.txt' });
    const b = makeTab({ key: 'b.txt', fileName: 'b.txt' });

    renderDialog(a, { tabs: [a, b] });

    expect(screen.getByRole('tab', { name: 'a.txt' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'b.txt' })).toBeDefined();
  });

  it('calls onTabClose when a tab close button is clicked', async () => {
    const user = userEvent.setup();
    const onTabClose = vi.fn();
    const a = makeTab({ key: 'a.txt', fileName: 'a.txt' });

    renderDialog(a, { tabs: [a], onTabClose });

    await user.click(screen.getByRole('button', { name: 'Close a.txt' }));

    expect(onTabClose).toHaveBeenCalledWith('a.txt');
  });

  it('renders markdown tables when isMarkdown is true', () => {
    const tableMarkdown = [
      '| Name | Score |',
      '|------|-------|',
      '| Ada  | 99    |',
      '| Bob  | 42    |',
    ].join('\n');

    renderDialog(
      makeTab({
        content: tableMarkdown,
        isMarkdown: true,
        language: 'markdown',
      }),
    );

    expect(screen.getByRole('table')).toBeDefined();
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: 'Score' })).toBeDefined();
    expect(screen.getByRole('cell', { name: 'Ada' })).toBeDefined();
    expect(screen.getByRole('cell', { name: '99' })).toBeDefined();
  });

  it('switches to source view when Source toggle is clicked', async () => {
    const user = userEvent.setup();
    const tableMarkdown = '| A | B |\n|---|---|\n| 1 | 2 |';

    renderDialog(
      makeTab({
        content: tableMarkdown,
        isMarkdown: true,
        language: 'markdown',
      }),
    );

    expect(screen.getByRole('table')).toBeDefined();

    const sourceTab = screen.getByRole('tab', { name: 'Source' });
    await user.click(sourceTab);

    expect(screen.queryByRole('table')).toBeNull();
    expect(sourceTab.getAttribute('aria-selected')).toBe('true');
  });

  it('renders markdown source as plain pre to avoid Tailwind class collisions with Prism markdown grammar', async () => {
    const user = userEvent.setup();
    const tableMarkdown = '| A | B |\n|---|---|\n| 1 | 2 |';

    renderDialog(
      makeTab({
        content: tableMarkdown,
        isMarkdown: true,
        language: 'markdown',
      }),
    );

    await user.click(screen.getByRole('tab', { name: 'Source' }));

    const pre = document.querySelector(
      '[role="dialog"] pre',
    ) as HTMLPreElement | null;
    expect(pre).not.toBeNull();
    expect(pre!.textContent).toBe(tableMarkdown);
    expect(pre!.querySelector('span.token.table')).toBeNull();
    expect(pre!.className).toMatch(/whitespace-pre(\s|$)/);
  });

  it('does not render the view toggle for non-markdown files (mdx regression)', () => {
    renderDialog(
      makeTab({
        key: 'readme.mdx',
        fileName: 'readme.mdx',
        content: '# Hello\n\n| A | B |\n|---|---|\n| 1 | 2 |',
        isMarkdown: false,
        language: 'markdown',
      }),
    );

    expect(screen.queryByRole('tab', { name: 'Rendered' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Source' })).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows loading state', () => {
    renderDialog(
      makeTab({
        loading: true,
      }),
    );

    expect(screen.getByText('Loading file content...')).toBeDefined();
  });
});
