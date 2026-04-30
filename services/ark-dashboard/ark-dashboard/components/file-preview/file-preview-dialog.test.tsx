import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FilePreviewDialog } from './file-preview-dialog';

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

describe('FilePreviewDialog', () => {
  it('should render when open', () => {
    render(
      <FilePreviewDialog
        open={true}
        onOpenChange={() => {}}
        fileName="test.txt"
        content="Sample content"
        loading={false}
        isImage={false}
        isJson={false}
        isMarkdown={false}
      />,
    );

    expect(screen.getByText('test.txt')).toBeDefined();
    expect(screen.getByText('Sample content')).toBeDefined();
  });

  it('should not render when closed', () => {
    render(
      <FilePreviewDialog
        open={false}
        onOpenChange={() => {}}
        fileName="test.txt"
        content="Sample content"
        loading={false}
        isImage={false}
        isJson={false}
        isMarkdown={false}
      />,
    );

    expect(screen.queryByText('test.txt')).toBeNull();
    expect(screen.queryByText('Sample content')).toBeNull();
  });

  it('should show loading state', () => {
    render(
      <FilePreviewDialog
        open={true}
        onOpenChange={() => {}}
        fileName="test.txt"
        content=""
        loading={true}
        isImage={false}
        isJson={false}
        isMarkdown={false}
      />,
    );

    expect(screen.getByText('test.txt')).toBeDefined();
    expect(screen.getByText('Loading file content...')).toBeDefined();
  });

  it('should render markdown tables when isMarkdown is true', () => {
    const tableMarkdown = [
      '| Name | Score |',
      '|------|-------|',
      '| Ada  | 99    |',
      '| Bob  | 42    |',
    ].join('\n');

    render(
      <FilePreviewDialog
        open={true}
        onOpenChange={() => {}}
        fileName="scores.md"
        content={tableMarkdown}
        loading={false}
        isImage={false}
        isJson={false}
        isMarkdown={true}
        language="markdown"
      />,
    );

    expect(screen.getByRole('table')).toBeDefined();
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: 'Score' })).toBeDefined();
    expect(screen.getByRole('cell', { name: 'Ada' })).toBeDefined();
    expect(screen.getByRole('cell', { name: '99' })).toBeDefined();
  });

  it('should switch to source view when Source toggle is clicked', async () => {
    const user = userEvent.setup();
    const tableMarkdown = '| A | B |\n|---|---|\n| 1 | 2 |';

    render(
      <FilePreviewDialog
        open={true}
        onOpenChange={() => {}}
        fileName="scores.md"
        content={tableMarkdown}
        loading={false}
        isImage={false}
        isJson={false}
        isMarkdown={true}
        language="markdown"
      />,
    );

    expect(screen.getByRole('table')).toBeDefined();

    const sourceToggle = screen.getByRole('radio', { name: 'Source view' });
    await user.click(sourceToggle);

    expect(screen.queryByRole('table')).toBeNull();
    expect(sourceToggle.getAttribute('aria-checked')).toBe('true');
  });

  it('should not render the toggle for non-markdown files (mdx regression)', () => {
    render(
      <FilePreviewDialog
        open={true}
        onOpenChange={() => {}}
        fileName="readme.mdx"
        content="# Hello\n\n| A | B |\n|---|---|\n| 1 | 2 |"
        loading={false}
        isImage={false}
        isJson={false}
        isMarkdown={false}
        language="markdown"
      />,
    );

    expect(screen.queryByRole('radio', { name: 'Rendered view' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Source view' })).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
