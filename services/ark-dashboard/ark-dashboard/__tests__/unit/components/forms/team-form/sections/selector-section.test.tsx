import { zodResolver } from '@hookform/resolvers/zod';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import * as z from 'zod';

import { SelectorSection } from '@/components/forms/team-form/sections/selector-section';
import { Form } from '@/components/ui/form';
import type { Agent } from '@/lib/services';

vi.mock('@/components/forms/team-form/use-team-form', () => ({
  DEFAULT_SELECTOR_PROMPT: 'This is the mocked default prompt for testing',
  DEFAULT_TERMINATE_PROMPT: 'This is the mocked default terminate prompt',
}));

const MOCK_DEFAULT_PROMPT = 'This is the mocked default prompt for testing';
const MOCK_DEFAULT_TERMINATE_PROMPT =
  'This is the mocked default terminate prompt';

const schema = z.object({
  name: z.string(),
  description: z.string().optional(),
  strategy: z.string(),
  maxTurns: z.string().optional(),
  selectorAgent: z.string().optional(),
  selectorPrompt: z.string().optional(),
  enableTerminateTool: z.boolean().optional(),
  terminatePrompt: z.string().optional(),
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
  initialSelectorAgent = '',
  enableTerminateTool = false,
  initialTerminatePrompt = '',
}: {
  readonly strategy?: string;
  readonly unavailableAgents?: string[];
  readonly disabled?: boolean;
  readonly initialSelectorPrompt?: string;
  readonly initialSelectorAgent?: string;
  readonly enableTerminateTool?: boolean;
  readonly initialTerminatePrompt?: string;
}) {
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      description: '',
      strategy,
      maxTurns: '',
      selectorAgent: initialSelectorAgent,
      selectorPrompt: initialSelectorPrompt,
      enableTerminateTool,
      terminatePrompt: initialTerminatePrompt,
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

  describe('Selector agent dropdown', () => {
    it('should list available agents as options', async () => {
      const user = userEvent.setup();
      render(<Wrapper />);

      await user.click(screen.getByRole('combobox'));

      expect(screen.getByRole('option', { name: 'agent-1' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'agent-2' })).toBeInTheDocument();
    });

    it('should include a None (Unset) option', async () => {
      const user = userEvent.setup();
      render(<Wrapper />);

      await user.click(screen.getByRole('combobox'));

      expect(screen.getByRole('option', { name: 'None (Unset)' })).toBeInTheDocument();
    });

    it('should be disabled when form is disabled', () => {
      render(<Wrapper disabled={true} />);
      expect(screen.getByRole('combobox')).toBeDisabled();
    });

    it('should be enabled when form is not disabled', () => {
      render(<Wrapper disabled={false} />);
      expect(screen.getByRole('combobox')).toBeEnabled();
    });
  });

  describe('unavailable agents', () => {
    it('should apply red border to trigger when selected agent is unavailable', () => {
      render(
        <Wrapper
          initialSelectorAgent="missing-agent"
          unavailableAgents={['missing-agent']}
        />,
      );

      expect(screen.getByRole('combobox')).toHaveClass('border-red-500');
    });

    it('should not apply red border when selected agent is available', () => {
      render(
        <Wrapper
          initialSelectorAgent="agent-1"
          unavailableAgents={['missing-agent']}
        />,
      );

      expect(screen.getByRole('combobox')).not.toHaveClass('border-red-500');
    });

    it('should show unavailable agent with (Unavailable) label in the dropdown', async () => {
      const user = userEvent.setup();
      render(
        <Wrapper
          initialSelectorAgent="missing-agent"
          unavailableAgents={['missing-agent']}
        />,
      );

      await user.click(screen.getByRole('combobox'));

      expect(screen.getByRole('option', { name: 'missing-agent (Unavailable)' })).toBeInTheDocument();
    });

    it('should not show the (Unavailable) option when the selected agent is available', async () => {
      const user = userEvent.setup();
      render(
        <Wrapper
          initialSelectorAgent="agent-1"
          unavailableAgents={['missing-agent']}
        />,
      );

      await user.click(screen.getByRole('combobox'));

      expect(screen.queryByText(/Unavailable/)).not.toBeInTheDocument();
    });
  });

  describe('Enable Terminate Tool', () => {
    it('should render the enable terminate tool checkbox in advanced settings', async () => {
      const user = userEvent.setup();
      render(<Wrapper />);

      await user.click(screen.getByText('Advanced Settings'));

      expect(screen.getByRole('checkbox')).toBeInTheDocument();
      expect(screen.getByText('Enable Terminate Tool')).toBeInTheDocument();
    });

    it('should not show terminate prompt when enableTerminateTool is false', async () => {
      const user = userEvent.setup();
      render(<Wrapper enableTerminateTool={false} />);

      await user.click(screen.getByText('Advanced Settings'));

      expect(
        screen.queryByPlaceholderText('Enter the terminate prompt...'),
      ).not.toBeInTheDocument();
    });

    it('should show terminate prompt textarea when enableTerminateTool is true', async () => {
      const user = userEvent.setup();
      render(<Wrapper enableTerminateTool={true} />);

      await user.click(screen.getByText('Advanced Settings'));

      expect(
        screen.getByPlaceholderText('Enter the terminate prompt...'),
      ).toBeInTheDocument();
    });

    it('should show terminate prompt after checking the checkbox', async () => {
      const user = userEvent.setup();
      render(<Wrapper enableTerminateTool={false} />);

      await user.click(screen.getByText('Advanced Settings'));
      expect(
        screen.queryByPlaceholderText('Enter the terminate prompt...'),
      ).not.toBeInTheDocument();

      await user.click(screen.getByRole('checkbox'));
      expect(
        screen.getByPlaceholderText('Enter the terminate prompt...'),
      ).toBeInTheDocument();
    });

    it('should reset terminate prompt to default when reset button is clicked', async () => {
      const user = userEvent.setup();
      render(
        <Wrapper
          enableTerminateTool={true}
          initialTerminatePrompt="custom terminate prompt"
        />,
      );

      await user.click(screen.getByText('Advanced Settings'));

      const textarea = screen.getByPlaceholderText('Enter the terminate prompt...');
      expect(textarea).toHaveValue('custom terminate prompt');

      const formItem = textarea.parentElement!;
      await user.click(
        within(formItem).getByRole('button', { name: /Reset to Default Prompt/i }),
      );

      expect(textarea).toHaveValue(MOCK_DEFAULT_TERMINATE_PROMPT);
    });

    it('should disable terminate prompt textarea when form is disabled', async () => {
      const user = userEvent.setup();
      render(<Wrapper enableTerminateTool={true} disabled={true} />);

      await user.click(screen.getByText('Advanced Settings'));

      expect(
        screen.getByPlaceholderText('Enter the terminate prompt...'),
      ).toBeDisabled();
    });
  });
});
