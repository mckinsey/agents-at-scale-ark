import { render, screen } from '@testing-library/react';
import { Provider as JotaiProvider, createStore } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { lastListUrlAtom } from '@/atoms/navigation-history';
import { DetailBreadcrumb } from '@/components/common/detail-breadcrumb';

const mockUsePathname = vi.fn<() => string>();
const mockUseSearchParams = vi.fn<() => URLSearchParams>();

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
  useSearchParams: () => mockUseSearchParams(),
}));

describe('DetailBreadcrumb', () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore();
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue('/agents/alpha');
    mockUseSearchParams.mockReturnValue(new URLSearchParams('namespace=blue'));
  });

  const renderBreadcrumb = () =>
    render(
      <JotaiProvider store={store}>
        <DetailBreadcrumb
          backHref="/agents"
          backLabel="Agents"
          current="alpha"
        />
      </JotaiProvider>,
    );

  const backLink = () => screen.getByRole('link', { name: /Agents/ });

  it('returns to the list as it was left', () => {
    store.set(lastListUrlAtom, { '/agents': '/agents?q=alpha&page=2' });

    renderBreadcrumb();

    const href = new URL(
      backLink().getAttribute('href') ?? '',
      'http://localhost',
    );
    expect(href.pathname).toBe('/agents');
    expect(href.searchParams.get('q')).toBe('alpha');
    expect(href.searchParams.get('page')).toBe('2');
  });

  it('invents no parameters for a list not visited since the page loaded', () => {
    renderBreadcrumb();

    const href = new URL(
      backLink().getAttribute('href') ?? '',
      'http://localhost',
    );
    expect(href.pathname).toBe('/agents');
    expect(href.searchParams.get('q')).toBeNull();
    expect(href.searchParams.get('page')).toBeNull();
  });

  it('applies the namespace in use now, not the one the list was recorded under', () => {
    // The tracker strips the namespace before recording, so the restored URL
    // cannot carry a stale one back.
    store.set(lastListUrlAtom, { '/agents': '/agents?status=ready' });
    mockUseSearchParams.mockReturnValue(new URLSearchParams('namespace=green'));

    renderBreadcrumb();

    const href = new URL(
      backLink().getAttribute('href') ?? '',
      'http://localhost',
    );
    expect(href.searchParams.get('namespace')).toBe('green');
    expect(href.searchParams.get('status')).toBe('ready');
  });

  it('names the record being viewed as the current page', () => {
    renderBreadcrumb();

    expect(screen.getByText('alpha')).toHaveAttribute('aria-current', 'page');
  });
});
