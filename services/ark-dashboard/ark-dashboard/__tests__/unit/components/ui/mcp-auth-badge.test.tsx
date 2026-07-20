import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { McpAuthBadge } from '@/components/ui/mcp-auth-badge';
import {
  isNearExpiry,
  NEAR_EXPIRY_THRESHOLD_MS,
} from '@/lib/utils/mcp-auth';

describe('McpAuthBadge', () => {
  it('renders the Required state', () => {
    render(<McpAuthBadge authorization={{ state: 'Required' }} />);
    expect(screen.getByText('Auth required')).toBeInTheDocument();
  });

  it('renders the Authorized state', () => {
    render(<McpAuthBadge authorization={{ state: 'Authorized' }} />);
    expect(screen.getByText('Authorized')).toBeInTheDocument();
  });

  it('renders the DiscoveryFailed state', () => {
    render(<McpAuthBadge authorization={{ state: 'DiscoveryFailed' }} />);
    expect(screen.getByText('Discovery failed')).toBeInTheDocument();
  });

  it('renders nothing when authorization is absent', () => {
    const { container } = render(<McpAuthBadge authorization={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for an unknown state', () => {
    const { container } = render(
      <McpAuthBadge authorization={{ state: 'SomethingElse' }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('exposes authorizedBy via title', () => {
    render(
      <McpAuthBadge
        authorization={{ state: 'Authorized', authorizedBy: 'alice@example.com' }}
      />,
    );
    expect(screen.getByText('Authorized')).toHaveAttribute(
      'title',
      'Authorized by alice@example.com',
    );
  });
});

describe('isNearExpiry', () => {
  const now = Date.parse('2026-06-30T12:00:00Z');

  it('is true when expiry is within the threshold', () => {
    const soon = new Date(now + NEAR_EXPIRY_THRESHOLD_MS - 1000).toISOString();
    expect(isNearExpiry(soon, now)).toBe(true);
  });

  it('is true when already expired', () => {
    const past = new Date(now - 5000).toISOString();
    expect(isNearExpiry(past, now)).toBe(true);
  });

  it('is false when expiry is beyond the threshold', () => {
    const far = new Date(now + NEAR_EXPIRY_THRESHOLD_MS + 60000).toISOString();
    expect(isNearExpiry(far, now)).toBe(false);
  });

  it('is false when expiresAt is absent', () => {
    expect(isNearExpiry(undefined, now)).toBe(false);
    expect(isNearExpiry(null, now)).toBe(false);
  });
});
