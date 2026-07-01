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

function renderDialog(activeTab: PreviewTab | null) {
  const tabs = activeTab ? [activeTab] : [];
  return render(
    <MultiTabPreviewDialog
      open={true}
      onOpenChange={() => {}}
      tabs={tabs}
      activeTab={activeTab}
      activeTabKey={activeTab?.key ?? null}
      onTabClick={() => {}}
      onTabClose={() => {}}
      onCloseAll={() => {}}
    />,
  );
}

describe('MultiTabPreviewDialog', () => {
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

    const sourceToggle = screen.getByRole('radio', { name: 'Source view' });
    await user.click(sourceToggle);

    expect(screen.queryByRole('table')).toBeNull();
    expect(sourceToggle.getAttribute('aria-checked')).toBe('true');
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

    await user.click(screen.getByRole('radio', { name: 'Source view' }));

    const pre = document.querySelector(
      '[role="dialog"] pre',
    ) as HTMLPreElement | null;
    expect(pre).not.toBeNull();
    expect(pre!.textContent).toBe(tableMarkdown);
    expect(pre!.querySelector('span.token.table')).toBeNull();
    expect(pre!.className).toMatch(/whitespace-pre(\s|$)/);
  });

  it('does not render the toggle for non-markdown files (mdx regression)', () => {
    renderDialog(
      makeTab({
        key: 'readme.mdx',
        fileName: 'readme.mdx',
        content: '# Hello\n\n| A | B |\n|---|---|\n| 1 | 2 |',
        isMarkdown: false,
        language: 'markdown',
      }),
    );

    expect(screen.queryByRole('radio', { name: 'Rendered view' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Source view' })).toBeNull();
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
