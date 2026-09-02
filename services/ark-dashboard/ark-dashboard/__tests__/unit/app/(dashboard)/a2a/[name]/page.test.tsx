import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import A2AServerPage from '@/app/(dashboard)/a2a/[name]/page';
import type { A2AServerDetail } from '@/lib/services/a2a-servers';
import { useA2AServer } from '@/lib/services/a2a-servers-hooks';

vi.mock('next/navigation', () => ({
  useParams: () => ({ name: 'simple-agent' }),
  usePathname: vi.fn(() => '/a2a/simple-agent'),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/services/a2a-servers-hooks', () => ({
  useA2AServer: vi.fn(),
}));

vi.mock('@/components/namespaced-link', () => ({
  NamespacedLink: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

const server: A2AServerDetail = {
  id: 'simple-agent',
  name: 'simple-agent',
  namespace: 'default',
  description: 'Simple agent with conversation, math, and echo capabilities',
  status: {
    lastResolvedAddress: 'http://simple-agent.default.svc.cluster.local:80',
    conditions: [
      {
        type: 'Ready',
        status: 'True',
        message: 'Successfully discovered agent',
      },
      { type: 'Discovering', status: 'False' },
    ],
  },
  annotations: { 'ark.mckinsey.com/dashboard-icon': 'dns' },
  labels: { 'app.kubernetes.io/name': 'simple-agent' },
};

type HookResult = ReturnType<typeof useA2AServer>;

const hookResult = (over: Partial<HookResult>) =>
  ({ data: undefined, isLoading: false, error: null, ...over }) as HookResult;

describe('A2AServerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state', () => {
    vi.mocked(useA2AServer).mockReturnValue(hookResult({ isLoading: true }));

    render(<A2AServerPage />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders the breadcrumb back to the list', () => {
    vi.mocked(useA2AServer).mockReturnValue(hookResult({ data: server }));

    render(<A2AServerPage />);

    expect(screen.getByRole('link', { name: /A2A servers/ })).toHaveAttribute(
      'href',
      '/a2a',
    );
  });

  it('renders the Identify card', () => {
    vi.mocked(useA2AServer).mockReturnValue(hookResult({ data: server }));

    render(<A2AServerPage />);

    expect(screen.getByText('Identify')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Simple agent with conversation, math, and echo capabilities',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('http://simple-agent.default.svc.cluster.local:80'),
    ).toBeInTheDocument();
  });

  it('renders the All Status card', () => {
    vi.mocked(useA2AServer).mockReturnValue(hookResult({ data: server }));

    render(<A2AServerPage />);

    expect(screen.getByText('All Status')).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Available' })).toBeInTheDocument();
    expect(screen.getByText('True')).toBeInTheDocument();
    expect(screen.getByText('False')).toBeInTheDocument();
  });

  it('shows Unavailable with the status message when not ready', () => {
    vi.mocked(useA2AServer).mockReturnValue(
      hookResult({
        data: {
          ...server,
          status: {
            conditions: [
              {
                type: 'Ready',
                status: 'False',
                message: 'A2A server is being initialized',
              },
            ],
          },
        },
      }),
    );

    render(<A2AServerPage />);

    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(
      screen.getByText('A2A server is being initialized'),
    ).toBeInTheDocument();
  });

  it('renders the metadata section with the annotations', () => {
    vi.mocked(useA2AServer).mockReturnValue(hookResult({ data: server }));

    render(<A2AServerPage />);

    expect(
      screen.getByText('Metadata (labels & annotations)'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/ark.mckinsey.com\/dashboard-icon/),
    ).toBeInTheDocument();
  });

  it('renders labels alongside annotations in the metadata section', () => {
    vi.mocked(useA2AServer).mockReturnValue(hookResult({ data: server }));

    const { container } = render(<A2AServerPage />);

    expect(container.querySelector('pre')?.textContent).toBe(
      JSON.stringify(
        {
          labels: { 'app.kubernetes.io/name': 'simple-agent' },
          annotations: { 'ark.mckinsey.com/dashboard-icon': 'dns' },
        },
        null,
        2,
      ),
    );
  });

  it('shows an error state with a way back to the list', () => {
    vi.mocked(useA2AServer).mockReturnValue(
      hookResult({ error: new Error('boom') }),
    );

    render(<A2AServerPage />);

    expect(
      screen.getByText("Couldn't load this A2A server"),
    ).toBeInTheDocument();
    expect(screen.getByText('boom')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to A2A servers' }),
    ).toHaveAttribute('href', '/a2a');
    expect(
      screen.queryByRole('button', { name: 'Back to A2A servers' }),
    ).not.toBeInTheDocument();
  });
});
