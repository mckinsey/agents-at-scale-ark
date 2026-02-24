import { zodResolver } from '@hookform/resolvers/zod';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import * as z from 'zod';

import { SelectorSection } from '@/components/forms/team-form/sections/selector-section';
import { Form } from '@/components/ui/form';
import type { Agent } from '@/lib/services';

const schema = z.object({
  name: z.string(),
  description: z.string().optional(),
  strategy: z.string(),
  maxTurns: z.string().optional(),
  selectorAgent: z.string().optional(),
  selectorPrompt: z.string().optional(),
});

const mockAgents: Agent[] = [
  { id: 'a1', name: 'agent-1', description: 'First agent' } as Agent,
  { id: 'a2', name: 'agent-2', description: 'Second agent' } as Agent,
];

function Wrapper({
  strategy = 'selector',
  unavailableAgents = [] as string[],
  disabled = false,
}: {
  strategy?: string;
  unavailableAgents?: string[];
  disabled?: boolean;
}) {
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      description: '',
      strategy,
      maxTurns: '',
      selectorAgent: '',
      selectorPrompt: 'test prompt',
    },
  });

  return (
    <Form {...form}>
      <SelectorSection
        form={form}
        agents={mockAgents}
        unavailableAgents={unavailableAgents}
        disabled={disabled}
      />
    </Form>
  );
}

describe('SelectorSection', () => {
  it('should render nothing when strategy is not selector', () => {
    const { container } = render(<Wrapper strategy="round-robin" />);
    expect(container.innerHTML).toBe('');
  });

  it('should render selector configuration for selector strategy', () => {
    render(<Wrapper />);
    expect(screen.getByText('Selector Configuration')).toBeInTheDocument();
  });

  it('should render selector agent dropdown', () => {
    render(<Wrapper />);
    expect(screen.getByText('Selector Agent')).toBeInTheDocument();
  });

  it('should render selector prompt textarea', () => {
    render(<Wrapper />);
    expect(
      screen.getByPlaceholderText('Enter the selector prompt...'),
    ).toBeInTheDocument();
  });

  it('should show character count when prompt has content', () => {
    render(<Wrapper />);
    expect(screen.getByText('11 characters')).toBeInTheDocument();
  });

  it('should render info text about selector strategy', () => {
    render(<Wrapper />);
    expect(
      screen.getByText(/Selector strategy uses an AI agent/),
    ).toBeInTheDocument();
  });

  it('should toggle prompt expansion', async () => {
    const user = userEvent.setup();
    render(<Wrapper />);

    expect(screen.getByText('Expand')).toBeInTheDocument();
    await user.click(screen.getByText('Expand'));
    expect(screen.getByText('Collapse')).toBeInTheDocument();
    expect(screen.getByText('1 lines')).toBeInTheDocument();
  });
});
