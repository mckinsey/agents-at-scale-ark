import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentsAPIDialog } from '@/components/dialogs/agents-api-dialog';
import type { Agent } from '@/lib/services';

vi.mock('copy-to-clipboard', () => ({
  default: vi.fn(),
}));

describe('AgentsAPIDialog', () => {
  const mockAgents: Agent[] = [
    {
      id: 'agent-1',
      name: 'test-agent',
      namespace: 'default',
      description: 'Test agent',
      model: 'gpt-4',
      isA2A: false,
    } as Agent,
    {
      id: 'agent-2',
      name: 'another-agent',
      namespace: 'default',
      description: 'Another test agent',
      model: 'gpt-4',
      isA2A: false,
    } as Agent,
  ];

  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    agents: mockAgents,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://test.example.com' },
      writable: true,
    });
  });

  describe('Dialog rendering', () => {
    it('should render dialog when open is true', () => {
      render(<AgentsAPIDialog {...defaultProps} />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('API Access')).toBeInTheDocument();
    });

    it('should display dialog description', () => {
      render(<AgentsAPIDialog {...defaultProps} />);
      expect(
        screen.getByText(
          'Use the OpenAI-compatible API to chat with your agents from external systems.',
        ),
      ).toBeInTheDocument();
    });

    it('should not render dialog when open is false', () => {
      render(<AgentsAPIDialog {...defaultProps} open={false} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('Agent selection', () => {
    it('should display agent selector', () => {
      render(<AgentsAPIDialog {...defaultProps} />);
      expect(screen.getByText('Select Agent')).toBeInTheDocument();
    });

    it('should default to first agent', () => {
      render(<AgentsAPIDialog {...defaultProps} />);
      const selectTrigger = screen.getByRole('combobox');
      expect(selectTrigger).toHaveTextContent('test-agent');
    });

    it('should handle empty agents array', () => {
      render(<AgentsAPIDialog {...defaultProps} agents={[]} />);
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('should allow selecting different agent', async () => {
      const user = userEvent.setup();
      render(<AgentsAPIDialog {...defaultProps} />);

      const selectTrigger = screen.getByRole('combobox');
      await user.click(selectTrigger);

      await waitFor(
        () => {
          expect(screen.getByText('another-agent')).toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      const anotherAgentOption = screen.getByText('another-agent');
      await user.click(anotherAgentOption);

      await waitFor(() => {
        expect(selectTrigger).toHaveTextContent('another-agent');
      });
    });
  });

  describe('Endpoint configuration', () => {
    it('should display endpoint section', () => {
      render(<AgentsAPIDialog {...defaultProps} />);
      expect(screen.getByText('Endpoint')).toBeInTheDocument();
    });

    it('should show external endpoint by default', () => {
      render(<AgentsAPIDialog {...defaultProps} />);
      const endpointSection = screen.getByText('Endpoint').closest('div');
      expect(endpointSection).toBeInTheDocument();
      expect(
        screen.getAllByText(/https:\/\/test\.example\.com\/api\/openai\/v1\/chat\/completions/)[0],
      ).toBeInTheDocument();
    });

    it('should display endpoint toggle switch', () => {
      render(<AgentsAPIDialog {...defaultProps} />);
      expect(screen.getByText('External')).toBeInTheDocument();
    });

    it('should toggle to internal endpoint', async () => {
      const user = userEvent.setup();
      render(<AgentsAPIDialog {...defaultProps} />);

      const toggle = screen.getByRole('switch');
      await user.click(toggle);

      await waitFor(() => {
        expect(screen.getByText('Cluster internal')).toBeInTheDocument();
        const internalEndpoints = screen.getAllByText(
          /http:\/\/ark-api\.<namespace>\.svc\.cluster\.local\/api\/openai\/v1\/chat\/completions/,
        );
        expect(internalEndpoints.length).toBeGreaterThan(0);
      });
    });

    it('should show namespace warning when internal endpoint is selected', async () => {
      const user = userEvent.setup();
      render(<AgentsAPIDialog {...defaultProps} />);

      const toggle = screen.getByRole('switch');
      await user.click(toggle);

      await waitFor(() => {
        expect(
          screen.getByText(/Replace <namespace> with the namespace/),
        ).toBeInTheDocument();
      });
    });

    it('should copy endpoint to clipboard', async () => {
      const user = userEvent.setup();
      const copyModule = await import('copy-to-clipboard');
      const copy = copyModule.default;
      render(<AgentsAPIDialog {...defaultProps} />);

      const endpointSection = screen.getByText('Endpoint').closest('div');
      const copyButton = endpointSection?.querySelector('button[aria-label*="copy"], button:has(svg)');

      expect(copyButton).toBeInTheDocument();
      if (copyButton) {
        await user.click(copyButton);

        await waitFor(() => {
          expect(copy).toHaveBeenCalledWith(
            expect.stringContaining('/api/openai/v1/chat/completions'),
          );
        });
      }
    });
  });

  describe('Code examples', () => {
    it('should display code examples section', () => {
      render(<AgentsAPIDialog {...defaultProps} />);
      expect(screen.getByText('Code Examples')).toBeInTheDocument();
    });

    it('should default to Python tab', () => {
      render(<AgentsAPIDialog {...defaultProps} />);
      expect(screen.getByText('Python')).toBeInTheDocument();
      expect(screen.getByText(/import requests/)).toBeInTheDocument();
    });

    it('should display Python code snippet', () => {
      render(<AgentsAPIDialog {...defaultProps} />);
      expect(screen.getByText(/import requests/)).toBeInTheDocument();
      expect(screen.getByText(/agent\/test-agent/)).toBeInTheDocument();
    });

    it('should switch to Go tab', async () => {
      const user = userEvent.setup();
      render(<AgentsAPIDialog {...defaultProps} />);

      const goTab = screen.getByText('Go');
      await user.click(goTab);

      await waitFor(() => {
        expect(screen.getByText(/package main/)).toBeInTheDocument();
        expect(screen.getByText(/agent\/test-agent/)).toBeInTheDocument();
      });
    });

    it('should switch to Bash tab', async () => {
      const user = userEvent.setup();
      render(<AgentsAPIDialog {...defaultProps} />);

      const bashTab = screen.getByText('Bash');
      await user.click(bashTab);

      await waitFor(() => {
        expect(screen.getByText(/curl -X POST/)).toBeInTheDocument();
        expect(screen.getByText(/agent\/test-agent/)).toBeInTheDocument();
      });
    });

    it('should update code snippet when agent changes', async () => {
      const user = userEvent.setup();
      render(<AgentsAPIDialog {...defaultProps} />);

      const selectTrigger = screen.getByRole('combobox');
      await user.click(selectTrigger);

      await waitFor(
        () => {
          expect(screen.getByText('another-agent')).toBeInTheDocument();
        },
        { timeout: 3000 },
      );

      const anotherAgentOption = screen.getByText('another-agent');
      await user.click(anotherAgentOption);

      await waitFor(() => {
        expect(screen.getByText(/agent\/another-agent/)).toBeInTheDocument();
      });
    });

    it('should update code snippet when endpoint changes', async () => {
      const user = userEvent.setup();
      render(<AgentsAPIDialog {...defaultProps} />);

      const toggle = screen.getByRole('switch');
      await user.click(toggle);

      await waitFor(() => {
        const codeContents = screen.getAllByText(/http:\/\/ark-api/);
        expect(codeContents.length).toBeGreaterThan(0);
      });
    });

    it('should copy code to clipboard', async () => {
      const user = userEvent.setup();
      const copyModule = await import('copy-to-clipboard');
      const copy = copyModule.default;
      render(<AgentsAPIDialog {...defaultProps} />);

      const codeSection = screen.getByText('Code Examples').closest('div');
      const copyButton = codeSection?.querySelector('button[aria-label*="copy"], button:has(svg)');

      expect(copyButton).toBeInTheDocument();
      if (copyButton) {
        await user.click(copyButton);

        await waitFor(() => {
          expect(copy).toHaveBeenCalledWith(expect.stringContaining('import requests'));
        });
      }
    });
  });

  describe('Copy functionality', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('should handle copy endpoint button click', async () => {
      const user = userEvent.setup();
      vi.useFakeTimers();
      render(<AgentsAPIDialog {...defaultProps} />);

      const endpointSection = screen.getByText('Endpoint').closest('div');
      const copyButton = endpointSection?.querySelector('button[aria-label*="copy"], button:has(svg)');

      if (copyButton) {
        await user.click(copyButton);

        await waitFor(() => {
          const svgIcons = copyButton.querySelectorAll('svg');
          expect(svgIcons.length).toBeGreaterThan(0);
        });

        vi.advanceTimersByTime(2000);
        vi.runAllTimers();
      }
    });

    it('should handle copy code button click', async () => {
      const user = userEvent.setup();
      vi.useFakeTimers();
      render(<AgentsAPIDialog {...defaultProps} />);

      const codeSection = screen.getByText('Code Examples').closest('div');
      const copyButton = codeSection?.querySelector('button[aria-label*="copy"], button:has(svg)');

      if (copyButton) {
        await user.click(copyButton);

        await waitFor(() => {
          const svgIcons = copyButton.querySelectorAll('svg');
          expect(svgIcons.length).toBeGreaterThan(0);
        });

        vi.advanceTimersByTime(2000);
        vi.runAllTimers();
      }
    });
  });

  describe('Dialog interaction', () => {
    it('should call onOpenChange when dialog is closed', async () => {
      const user = userEvent.setup();
      render(<AgentsAPIDialog {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      
      const closeButton = screen.queryByRole('button', { name: /close/i });
      
      if (closeButton) {
        await user.click(closeButton);
      } else {
        await user.keyboard('{Escape}');
      }

      await waitFor(
        () => {
          expect(defaultProps.onOpenChange).toHaveBeenCalled();
        },
        { timeout: 3000 },
      );
    });
  });
});

