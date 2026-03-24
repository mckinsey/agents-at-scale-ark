import { zodResolver } from '@hookform/resolvers/zod';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import * as z from 'zod';

import { StrategySection } from '@/components/forms/team-form/sections/strategy-section';
import { Form } from '@/components/ui/form';

const schema = z.object({
  name: z.string(),
  description: z.string().optional(),
  strategy: z.string().min(1),
  maxTurns: z.string().optional(),
  selectorAgent: z.string().optional(),
  selectorPrompt: z.string().optional(),
});

function Wrapper({
  defaultStrategy = 'sequential',
  disabled = false,
}: {
  defaultStrategy?: string;
  disabled?: boolean;
}) {
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      description: '',
      strategy: defaultStrategy,
      maxTurns: '',
      selectorAgent: '',
      selectorPrompt: '',
    },
  });

  return (
    <Form {...form}>
      <StrategySection form={form} disabled={disabled} />
    </Form>
  );
}

describe('StrategySection', () => {
  it('should render strategy heading', () => {
    render(<Wrapper />);
    expect(screen.getByText('Strategy Configuration')).toBeInTheDocument();
  });

  it('should render strategy select', () => {
    render(<Wrapper />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('should default to sequential', () => {
    render(<Wrapper />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Sequential');
  });

  it('should show max turns field for graph strategy', () => {
    render(<Wrapper defaultStrategy="graph" />);
    expect(screen.getByText('Max Turns')).toBeInTheDocument();
  });

  it('should hide max turns field for sequential strategy', () => {
    render(<Wrapper defaultStrategy="sequential" />);
    expect(screen.queryByText('Max Turns')).not.toBeInTheDocument();
  });

  it('should show required indicator on max turns for graph strategy', () => {
    render(<Wrapper defaultStrategy="graph" />);
    const maxTurnsLabel = screen.getByText('Max Turns');
    const requiredIndicator = maxTurnsLabel.parentElement?.querySelector(
      '.text-red-500',
    );
    expect(requiredIndicator).toBeInTheDocument();
  });

  it('should allow changing strategy', async () => {
    const user = userEvent.setup();
    render(<Wrapper />);

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Sequential' }));

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toHaveTextContent('Sequential');
    });
  });

  it('should set default selector prompt when switching to selector', async () => {
    const user = userEvent.setup();
    render(<Wrapper />);

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Selector' }));

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toHaveTextContent('Selector');
    });
  });
});
