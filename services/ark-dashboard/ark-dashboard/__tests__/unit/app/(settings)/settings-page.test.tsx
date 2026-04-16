import { render, screen } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { useParams, useRouter } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: vi.fn(),
  useRouter: vi.fn(),
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
      replace: mockReplace,
    });
  });

  const renderPage = () =>
    render(
      <JotaiProvider>
        <SettingsPage />
      </JotaiProvider>,
    );

  it('should redirect to default page when no page segment is provided', () => {
    (useParams as ReturnType<typeof vi.fn>).mockReturnValue({ page: undefined });
    renderPage();
    expect(mockReplace).toHaveBeenCalledWith('/settings/a2a-servers');
  });

  it('should redirect to default page when an invalid page is provided', () => {
    (useParams as ReturnType<typeof vi.fn>).mockReturnValue({
      page: ['nonexistent'],
    });
    renderPage();
    expect(mockReplace).toHaveBeenCalledWith('/settings/a2a-servers');
  });

  it('should not redirect when a valid page is provided', () => {
    (useParams as ReturnType<typeof vi.fn>).mockReturnValue({
      page: ['secrets'],
    });
    renderPage();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('should pass the valid page key to sidebar and content', () => {
    (useParams as ReturnType<typeof vi.fn>).mockReturnValue({
      page: ['memory'],
    });
    renderPage();
    expect(screen.getByTestId('settings-sidebar')).toHaveTextContent('memory');
    expect(screen.getByTestId('settings-content')).toHaveTextContent('memory');
  });

  it('should pass default page to sidebar and content when page is invalid', () => {
    (useParams as ReturnType<typeof vi.fn>).mockReturnValue({
      page: ['bogus'],
    });
    renderPage();
    expect(screen.getByTestId('settings-sidebar')).toHaveTextContent(
      'a2a-servers',
    );
    expect(screen.getByTestId('settings-content')).toHaveTextContent(
      'a2a-servers',
    );
  });

  it.each([
    'a2a-servers',
    'memory',
    'manage-marketplace',
    'service-api-keys',
    'secrets',
    'experimental-features',
  ])('should accept "%s" as a valid page', page => {
    (useParams as ReturnType<typeof vi.fn>).mockReturnValue({ page: [page] });
    renderPage();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByTestId('settings-content')).toHaveTextContent(page);
  });
});
