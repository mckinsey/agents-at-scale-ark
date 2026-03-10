import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(() => new URLSearchParams('namespace=test-ns')),
}));

vi.mock('@/components/ui/sidebar', () => ({
  SidebarTrigger: () => <button>sidebar</button>,
}));

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

import { PageHeader } from '@/components/common/page-header';

describe('PageHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves namespace in breadcrumb links', () => {
    render(
      <PageHeader
        breadcrumbs={[{ href: '/', label: 'ARK Dashboard' }]}
        currentPage="Agents"
      />,
    );

    const links = screen.getAllByRole('link', { name: 'ARK Dashboard' });
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/?namespace=test-ns');
    }
  });

  it('preserves namespace in breadcrumb links with multiple crumbs', () => {
    render(
      <PageHeader
        breadcrumbs={[
          { href: '/', label: 'ARK Dashboard' },
          { href: '/agents', label: 'Agents' },
        ]}
        currentPage="Agent Detail"
      />,
    );

    const dashboardLinks = screen.getAllByRole('link', {
      name: 'ARK Dashboard',
    });
    for (const link of dashboardLinks) {
      expect(link).toHaveAttribute('href', '/?namespace=test-ns');
    }

    const agentsLinks = screen.getAllByRole('link', { name: 'Agents' });
    for (const link of agentsLinks) {
      expect(link).toHaveAttribute('href', '/agents?namespace=test-ns');
    }
  });

  it('preserves namespace in dropdown breadcrumb links when crumbs exceed 2', () => {
    render(
      <PageHeader
        breadcrumbs={[
          { href: '/', label: 'ARK Dashboard' },
          { href: '/agents', label: 'Agents' },
          { href: '/agents/details', label: 'Details' },
        ]}
        currentPage="Edit"
      />,
    );

    const dashboardLinks = screen.getAllByRole('link', {
      name: 'ARK Dashboard',
    });
    for (const link of dashboardLinks) {
      expect(link).toHaveAttribute('href', '/?namespace=test-ns');
    }
  });
});
