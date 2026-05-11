import { describe, expect, it, vi } from 'vitest';

vi.mock('next/font/google', () => ({
  Inter: () => ({ variable: '--font-inter' }),
}));

vi.mock('next/font/local', () => ({
  default: () => ({ variable: '--font-geist-mono' }),
}));

vi.mock('@/providers/GlobalProviders', () => ({
  GlobalProviders: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

import { metadata } from '@/app/layout';

describe('RootLayout metadata', () => {
  it('should have correct title and description', () => {
    expect(metadata.title).toBe('Ark Dashboard');
    expect(metadata.description).toBe(
      'Basic Configuration and Monitoring for Ark',
    );
  });
});
