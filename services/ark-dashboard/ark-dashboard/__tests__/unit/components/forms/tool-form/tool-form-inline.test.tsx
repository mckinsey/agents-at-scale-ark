import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToolForm } from '@/components/forms/tool-form/tool-form';
import { ToolFormMode } from '@/components/forms/tool-form/types';
import { toolsService } from '@/lib/services';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => '/tools'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: vi.fn(() => ({
    namespace: 'default',
    isNamespaceResolved: true,
    isPending: false,
    readOnlyMode: false,
  })),
}));

vi.mock('@/lib/hooks/use-namespaced-navigation', () => ({
  useNamespacedNavigation: vi.fn(() => ({ push: vi.fn() })),
}));

vi.mock('@/lib/services', () => ({
  toolsService: {
    create: vi.fn(),
    update: vi.fn(),
    getDetail: vi.fn(),
  },
  agentsService: { list: vi.fn().mockResolvedValue([]) },
  teamsService: { getAll: vi.fn().mockResolvedValue([]) },
}));

vi.mock('@/components/ui/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockToolsService = vi.mocked(toolsService);

function inlineTool(overrides: Record<string, unknown> = {}) {
  return {
    name: 'csv',
    namespace: 'default',
    spec: {
      type: 'inline',
      description: 'count rows',
      inline: { source: 'print(1)', language: 'python' },
    },
    status: {
      state: 'Pending',
      conditions: [
        {
          type: 'Available',
          status: 'False',
          reason: 'RuntimeNotInstalled',
          message: 'runtime is not installed',
        },
      ],
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.ResizeObserver = class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  } as unknown as typeof ResizeObserver;
});

describe('ToolForm — inline authoring', () => {
  it('shows a spinner while an existing tool loads', () => {
    mockToolsService.getDetail.mockReturnValue(new Promise(() => {}));

    const { container } = render(
      <ToolForm mode={ToolFormMode.EDIT} toolName="csv" />,
    );

    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('reports a missing tool instead of an empty form', async () => {
    mockToolsService.getDetail.mockResolvedValue(null);

    render(<ToolForm mode={ToolFormMode.EDIT} toolName="gone" />);

    expect(await screen.findByText('Tool not found')).toBeTruthy();
  });

  it('renders the inline source and language for an inline tool', async () => {
    mockToolsService.getDetail.mockResolvedValue(inlineTool());

    render(<ToolForm mode={ToolFormMode.EDIT} toolName="csv" />);

    expect(await screen.findByText('Source')).toBeTruthy();
    expect(screen.getByText('Language')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByDisplayValue('print(1)')).toBeTruthy();
    });
    // The byte counter is the field's own guard against the 65536 limit.
    expect(screen.getByText(/8 \/ 65536 UTF-8 bytes/)).toBeTruthy();
  });

  it('warns that a stored inline tool is not executable yet', async () => {
    mockToolsService.getDetail.mockResolvedValue(inlineTool());

    render(<ToolForm mode={ToolFormMode.EDIT} toolName="csv" />);

    const notice = await screen.findByRole('status');
    expect(notice.textContent).toContain('Pending.');
  });

  it('does not warn when the tool is available', async () => {
    mockToolsService.getDetail.mockResolvedValue(
      inlineTool({
        status: {
          state: 'Ready',
          conditions: [
            { type: 'Available', status: 'True', reason: 'Available' },
          ],
        },
      }),
    );

    render(<ToolForm mode={ToolFormMode.EDIT} toolName="csv" />);

    expect(await screen.findByText('Source')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('expands the source editor on request', async () => {
    const user = userEvent.setup();
    mockToolsService.getDetail.mockResolvedValue(inlineTool());

    render(<ToolForm mode={ToolFormMode.EDIT} toolName="csv" />);

    await screen.findByText('Source');
    // The source editor's toggle is the first of the three expandable fields.
    const [expandSource] = screen.getAllByRole('button', { name: /Expand/ });
    await user.click(expandSource);

    expect(screen.getByRole('button', { name: /Collapse/ })).toBeTruthy();
  });

  it('hides the inline fields for a non-inline tool', async () => {
    mockToolsService.getDetail.mockResolvedValue({
      name: 'fetch',
      namespace: 'default',
      spec: {
        type: 'http',
        description: 'fetch',
        http: { url: 'https://example.com' },
      },
      status: { state: 'Ready' },
    });

    render(<ToolForm mode={ToolFormMode.EDIT} toolName="fetch" />);

    expect(await screen.findByText('URL')).toBeTruthy();
    expect(screen.queryByText('Source')).toBeNull();
    expect(screen.queryByText('Language')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('starts a create with no subtype fields shown', () => {
    render(<ToolForm mode={ToolFormMode.CREATE} />);

    expect(screen.getByText('New tool configuration')).toBeTruthy();
    expect(screen.queryByText('Source')).toBeNull();
    expect(mockToolsService.getDetail).not.toHaveBeenCalled();
  });
});
