import { render, screen } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: vi.fn(),
  useRouter: vi.fn(),
  useSearchParams: vi.fn(),
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({ namespace: 'default', isNamespaceResolved: true }),
}));

vi.mock('@/components/settings/settings-content', () => ({
  SettingsContent: ({ activePage }: { activePage: string }) => (
    <div data-testid="settings-content">{activePage}</div>
  ),
}));

vi.mock('@/components/settings/settings-sidebar', () => ({
  SettingsSidebar: ({ activePage }: { activePage: string }) => (
    <div data-testid="settings-sidebar">{activePage}</div>
  ),
}));

import SettingsPage from '@/app/(settings)/settings/[[...page]]/page';

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as ReturnType<typeof vi.fn>).mockReturnValue({
      push: mockPush,
      replace: mockReplace,
    });
    (useSearchParams as ReturnType<typeof vi.fn>).mockReturnValue(
      new URLSearchParams('namespace=demo'),
    );
  });

  const renderPage = () =>
    render(
      <JotaiProvider>
        <SettingsPage />
      </JotaiProvider>,
    );

  it('should redirect to default page preserving namespace when no page segment is provided', () => {
    (useParams as ReturnType<typeof vi.fn>).mockReturnValue({ page: undefined });
    renderPage();
    expect(mockReplace).toHaveBeenCalledWith('/settings/queries?namespace=demo');
  });

  it('should redirect to default page preserving namespace when an invalid page is provided', () => {
    (useParams as ReturnType<typeof vi.fn>).mockReturnValue({
      page: ['nonexistent'],
    });
    renderPage();
    expect(mockReplace).toHaveBeenCalledWith('/settings/queries?namespace=demo');
  });

  it('should not redirect when a valid page is provided', () => {
    (useParams as ReturnType<typeof vi.fn>).mockReturnValue({
      page: ['queries'],
    });
    renderPage();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('should pass the valid page key to sidebar and content', () => {
    (useParams as ReturnType<typeof vi.fn>).mockReturnValue({
      page: ['queries'],
    });
    renderPage();
    expect(screen.getByTestId('settings-sidebar')).toHaveTextContent('queries');
    expect(screen.getByTestId('settings-content')).toHaveTextContent('queries');
  });

  it('should pass default page to sidebar and content when page is invalid', () => {
    (useParams as ReturnType<typeof vi.fn>).mockReturnValue({
      page: ['bogus'],
    });
    renderPage();
    expect(screen.getByTestId('settings-sidebar')).toHaveTextContent(
      'queries',
    );
    expect(screen.getByTestId('settings-content')).toHaveTextContent(
      'queries',
    );
  });

  it.each([
    'queries',
    'experimental-features',
  ])('should accept "%s" as a valid page', page => {
    (useParams as ReturnType<typeof vi.fn>).mockReturnValue({ page: [page] });
    renderPage();
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByTestId('settings-content')).toHaveTextContent(page);
  });
});
