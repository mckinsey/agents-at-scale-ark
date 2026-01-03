import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FlowLogsSection } from '@/components/sections/flow-logs-section';
import * as flowsModule from '@/lib/services/flows';

vi.mock('@/lib/services/flows', () => ({
  checkArgoAvailable: vi.fn(),
  getArgoBaseUrl: vi.fn(),
  workflowTemplatesService: {
    getAll: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/flow-logs',
}));

global.fetch = vi.fn();

describe('FlowLogsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when Argo is not available', () => {
    it('shows Argo not available message', async () => {
      vi.mocked(flowsModule.checkArgoAvailable).mockResolvedValue(false);

      render(<FlowLogsSection />);

      await waitFor(() => {
        expect(
          screen.getByText('Argo Workflows Not Available'),
        ).toBeInTheDocument();
      });

      expect(
        screen.getByText(/Flow logs require Argo Workflows to be deployed/),
      ).toBeInTheDocument();

      expect(
        screen.getByRole('link', { name: /View Argo Setup Documentation/i }),
      ).toBeInTheDocument();
    });

    it('does not fetch workflows when Argo is unavailable', async () => {
      vi.mocked(flowsModule.checkArgoAvailable).mockResolvedValue(false);

      render(<FlowLogsSection />);

      await waitFor(() => {
        expect(
          screen.getByText('Argo Workflows Not Available'),
        ).toBeInTheDocument();
      });

      expect(fetch).not.toHaveBeenCalledWith(
        expect.stringContaining('/api/argo/workflows'),
      );
    });
  });

  describe('when Argo is available', () => {
    beforeEach(() => {
      vi.mocked(flowsModule.checkArgoAvailable).mockResolvedValue(true);
      vi.mocked(flowsModule.getArgoBaseUrl).mockResolvedValue(
        'http://localhost:2746',
      );
      vi.mocked(flowsModule.workflowTemplatesService.getAll).mockResolvedValue(
        [],
      );
    });

    it('shows empty state when no workflows exist', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => [],
      } as Response);

      render(<FlowLogsSection />);

      await waitFor(() => {
        expect(screen.getByText('No workflow runs found')).toBeInTheDocument();
      });
    });

    it('shows workflow runs in table', async () => {
      const mockWorkflows = [
        {
          name: 'workflow-abc123',
          namespace: 'default',
          templateName: 'my-template',
          phase: 'Succeeded',
          startedAt: '2024-01-01T10:00:00Z',
          finishedAt: '2024-01-01T10:05:00Z',
        },
      ];

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockWorkflows,
      } as Response);

      render(<FlowLogsSection />);

      await waitFor(() => {
        expect(screen.getByText('workflow-abc123')).toBeInTheDocument();
      });

      expect(screen.getByText('my-template')).toBeInTheDocument();
      expect(screen.getByText('Succeeded')).toBeInTheDocument();
    });

    it('shows loading state initially', () => {
      vi.mocked(flowsModule.checkArgoAvailable).mockImplementation(
        () => new Promise(() => {}),
      );

      render(<FlowLogsSection />);

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('displays namespace and template filters', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => [],
      } as Response);

      render(<FlowLogsSection />);

      await waitFor(() => {
        expect(screen.getByText('Namespace:')).toBeInTheDocument();
      });

      expect(screen.getByText('Template:')).toBeInTheDocument();
    });
  });
});
