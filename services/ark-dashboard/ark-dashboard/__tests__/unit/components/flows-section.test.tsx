import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FlowsSection } from '@/components/sections/flows-section';
import * as flowsModule from '@/lib/services/flows';

vi.mock('@/lib/services/flows', () => ({
  checkArgoAvailable: vi.fn(),
  flowsService: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
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
  usePathname: () => '/flows',
}));

describe('FlowsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when Argo is not available', () => {
    it('shows Argo not available message', async () => {
      vi.mocked(flowsModule.checkArgoAvailable).mockResolvedValue(false);

      render(<FlowsSection />);

      await waitFor(() => {
        expect(
          screen.getByText('Argo Workflows Not Available'),
        ).toBeInTheDocument();
      });

      expect(
        screen.getByText(/Flows require Argo Workflows to be deployed/),
      ).toBeInTheDocument();

      expect(
        screen.getByRole('link', { name: /View Argo Setup Documentation/i }),
      ).toBeInTheDocument();
    });

    it('does not load flows when Argo is unavailable', async () => {
      vi.mocked(flowsModule.checkArgoAvailable).mockResolvedValue(false);

      render(<FlowsSection />);

      await waitFor(() => {
        expect(
          screen.getByText('Argo Workflows Not Available'),
        ).toBeInTheDocument();
      });

      expect(flowsModule.flowsService.getAll).not.toHaveBeenCalled();
    });
  });

  describe('when Argo is available', () => {
    beforeEach(() => {
      vi.mocked(flowsModule.checkArgoAvailable).mockResolvedValue(true);
      vi.mocked(flowsModule.getArgoBaseUrl).mockResolvedValue(
        'http://localhost:2746',
      );
    });

    it('shows empty state when no flows exist', async () => {
      vi.mocked(flowsModule.flowsService.getAll).mockResolvedValue([]);

      render(<FlowsSection />);

      await waitFor(() => {
        expect(screen.getByText('No Flows Yet')).toBeInTheDocument();
      });

      expect(
        screen.getByRole('button', { name: /Create Flow/i }),
      ).toBeInTheDocument();
    });

    it('shows flow cards when flows exist', async () => {
      const mockFlows = [
        {
          id: 'flow-1',
          name: 'Test Flow 1',
          description: 'First test flow',
          templateName: 'template-1',
          templateNamespace: 'default',
          parameters: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'flow-2',
          name: 'Test Flow 2',
          description: 'Second test flow',
          templateName: 'template-2',
          templateNamespace: 'default',
          parameters: [],
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        },
      ];

      vi.mocked(flowsModule.flowsService.getAll).mockResolvedValue(mockFlows);

      render(<FlowsSection />);

      await waitFor(() => {
        expect(screen.getByText('Test Flow 1')).toBeInTheDocument();
      });

      expect(screen.getByText('Test Flow 2')).toBeInTheDocument();
    });

    it('calls checkArgoAvailable on mount', async () => {
      vi.mocked(flowsModule.flowsService.getAll).mockResolvedValue([]);

      render(<FlowsSection />);

      await waitFor(() => {
        expect(flowsModule.checkArgoAvailable).toHaveBeenCalled();
      });
    });
  });
});
