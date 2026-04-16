import { render, screen } from '@testing-library/react';
import { Activity } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import { MetricCard } from '@/components/cards/metric-card';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('namespace=test-ns'),
}));

describe('MetricCard', () => {
  it('preserves namespace query param in link href', () => {
    render(
      <MetricCard
        title="Models"
        value={5}
        Icon={Activity}
        href="/models"
        isLoading={false}
        hasError={false}
      />,
    );

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/models?namespace=test-ns');
  });
});
