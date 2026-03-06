import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(() => new URLSearchParams('namespace=test-ns')),
}));

import { NamespacedLink } from '@/components/namespaced-link';

describe('NamespacedLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
