import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FilePreviewDialog } from './file-preview-dialog';

vi.mock('@/lib/api/files-client', () => ({
  FILES_API_BASE_URL: 'http://localhost:3000/api',
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
      />,
    );

    expect(screen.getByText('test.txt')).toBeDefined();
    expect(screen.getByText('Loading file content...')).toBeDefined();
  });
});
