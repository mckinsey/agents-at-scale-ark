import { zodResolver } from '@hookform/resolvers/zod';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import * as z from 'zod';

import { SelectorSection } from '@/components/forms/team-form/sections/selector-section';
import { Form } from '@/components/ui/form';
import type { Agent } from '@/lib/services';

vi.mock('@/components/forms/team-form/use-team-form', () => ({
  DEFAULT_SELECTOR_PROMPT: 'This is the mocked default prompt for testing',
}));

const MOCK_DEFAULT_PROMPT = 'This is the mocked default prompt for testing';

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
  initialSelectorPrompt = 'test prompt',
}: {
  readonly strategy?: string;
  readonly unavailableAgents?: string[];
  readonly disabled?: boolean;
  readonly initialSelectorPrompt?: string;
}) {
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      description: '',
      strategy,
      maxTurns: '',
      selectorAgent: '',
      selectorPrompt: initialSelectorPrompt,
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

  it('should render selector prompt textarea in advanced settings', async () => {
    const user = userEvent.setup();
    render(<Wrapper />);

    await user.click(screen.getByText('Advanced Settings'));

    expect(
      screen.getByPlaceholderText('Enter the selector prompt...'),
    ).toBeInTheDocument();
  });

  it('should show character count when prompt has content', async () => {
    const user = userEvent.setup();
    render(<Wrapper />);

    await user.click(screen.getByText('Advanced Settings'));

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

    await user.click(screen.getByText('Advanced Settings'));

    expect(screen.getByText('Expand')).toBeInTheDocument();
    await user.click(screen.getByText('Expand'));
    expect(screen.getByText('Collapse')).toBeInTheDocument();
    expect(screen.getByText('1 lines')).toBeInTheDocument();
  });

  describe('Reset to Default Prompt button', () => {
    it('should render reset button in advanced settings', async () => {
      const user = userEvent.setup();
      render(<Wrapper />);

      await user.click(screen.getByText('Advanced Settings'));

      expect(
        screen.getByRole('button', { name: /Reset to Default Prompt/i }),
      ).toBeInTheDocument();
    });

    it('should reset prompt to mocked default value when clicked', async () => {
      const user = userEvent.setup();
      render(<Wrapper initialSelectorPrompt="custom prompt value" />);

      await user.click(screen.getByText('Advanced Settings'));

      const textarea = screen.getByPlaceholderText(
        'Enter the selector prompt...',
      );
      expect(textarea).toHaveValue('custom prompt value');

      const resetButton = screen.getByRole('button', {
        name: /Reset to Default Prompt/i,
      });
      await user.click(resetButton);

      expect(textarea).toHaveValue(MOCK_DEFAULT_PROMPT);
    });

    it('should be disabled when form is disabled', async () => {
      const user = userEvent.setup();
      render(<Wrapper disabled={true} />);

      await user.click(screen.getByText('Advanced Settings'));

      const resetButton = screen.getByRole('button', {
        name: /Reset to Default Prompt/i,
      });
      expect(resetButton).toBeDisabled();
    });

    it('should be enabled when form is not disabled', async () => {
      const user = userEvent.setup();
      render(<Wrapper disabled={false} />);

      await user.click(screen.getByText('Advanced Settings'));

      const resetButton = screen.getByRole('button', {
        name: /Reset to Default Prompt/i,
      });
      expect(resetButton).toBeEnabled();
    });

    it('should use the exact mocked constant value', async () => {
      const user = userEvent.setup();
      render(<Wrapper initialSelectorPrompt="" />);

      await user.click(screen.getByText('Advanced Settings'));

      const resetButton = screen.getByRole('button', {
        name: /Reset to Default Prompt/i,
      });
      await user.click(resetButton);

      const textarea = screen.getByPlaceholderText(
        'Enter the selector prompt...',
      );
      expect(textarea).toHaveValue(MOCK_DEFAULT_PROMPT);
      expect(MOCK_DEFAULT_PROMPT).toBe(
        'This is the mocked default prompt for testing',
      );
    });
  });
});
