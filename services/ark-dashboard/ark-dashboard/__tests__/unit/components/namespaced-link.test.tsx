import { render, screen } from '@testing-library/react';
import { usePathname, useSearchParams } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
  useSearchParams: vi.fn(() => new URLSearchParams('namespace=test-ns')),
}));

import { NamespacedLink } from '@/components/namespaced-link';

describe('NamespacedLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePathname).mockReturnValue('/');
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams('namespace=test-ns') as never,
    );
  });

  it('appends namespace query param to internal href', () => {
    render(<NamespacedLink href="/agents">Agents</NamespacedLink>);

    const link = screen.getByRole('link', { name: 'Agents' });
    expect(link).toHaveAttribute('href', '/agents?namespace=test-ns');
  });

  it('preserves existing query params in href', () => {
    render(
      <NamespacedLink href="/query/new?target_tool=mytool">
        Query
      </NamespacedLink>,
    );

    const link = screen.getByRole('link', { name: 'Query' });
    expect(link).toHaveAttribute(
      'href',
      '/query/new?namespace=test-ns&target_tool=mytool',
    );
  });

  it('drops page-local params when the link leaves the screen', () => {
    vi.mocked(usePathname).mockReturnValue('/models/new');
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams('namespace=test-ns&name=default') as never,
    );

    render(<NamespacedLink href="/models">Cancel</NamespacedLink>);

    const link = screen.getByRole('link', { name: 'Cancel' });
    expect(link).toHaveAttribute('href', '/models?namespace=test-ns');
  });

  it('keeps screen-owned params when the link targets the current screen', () => {
    vi.mocked(usePathname).mockReturnValue('/events');
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams('namespace=test-ns&status=failed') as never,
    );

    render(<NamespacedLink href="/events?page=2">Next</NamespacedLink>);

    const link = screen.getByRole('link', { name: 'Next' });
    expect(link).toHaveAttribute(
      'href',
      '/events?namespace=test-ns&status=failed&page=2',
    );
  });

  it('does not modify external URLs', () => {
    render(
      <NamespacedLink href="https://example.com/docs">Docs</NamespacedLink>,
    );

    const link = screen.getByRole('link', { name: 'Docs' });
    expect(link).toHaveAttribute('href', 'https://example.com/docs');
  });

  it('passes through additional props', () => {
    render(
      <NamespacedLink href="/agents" className="my-class" target="_blank">
        Agents
      </NamespacedLink>,
    );

    const link = screen.getByRole('link', { name: 'Agents' });
    expect(link).toHaveAttribute('href', '/agents?namespace=test-ns');
    expect(link).toHaveClass('my-class');
  });
});
