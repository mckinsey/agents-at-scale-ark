import { render, screen } from '@testing-library/react';

import { auth } from '../../auth';
import { fetchAccessibleNamespaces } from '../lib/namespaces';
import LandingPage from '../page';

jest.mock('../../auth', () => ({ auth: jest.fn() }));
jest.mock('../lib/namespaces', () => ({
  fetchAccessibleNamespaces: jest.fn(),
}));

const mockAuth = auth as jest.Mock;
const mockFetch = fetchAccessibleNamespaces as jest.Mock;

describe('LandingPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({ accessToken: 'token' });
    delete process.env.LANDING_PAGE_TITLE;
    delete process.env.LANDING_PAGE_SUBTITLE;
    delete process.env.LANDING_PAGE_INFO;
    delete process.env.NEXT_PUBLIC_ARK_DASHBOARD_URL;
  });

  it('renders the accessible namespaces with display name and description', async () => {
    mockFetch.mockResolvedValue([
      {
        name: 'tenant-a',
        displayName: 'Tenant A',
        description: 'Workspace A',
        dashboardUrl: 'https://custom.example.com/tenant-a',
      },
      { name: 'tenant-b', displayName: 'Tenant B' },
    ]);

    render(await LandingPage());

    expect(screen.getByText('Tenant A')).toBeInTheDocument();
    expect(screen.getByText('Workspace A')).toBeInTheDocument();
    expect(screen.getByText('Tenant B')).toBeInTheDocument();
    // tenant-b has no description annotation -> fallback copy
    expect(
      screen.getByText('Open the ARK dashboard for this namespace'),
    ).toBeInTheDocument();
  });

  it('links to the annotation URL when set, else derives from the namespace', async () => {
    mockFetch.mockResolvedValue([
      {
        name: 'tenant-a',
        displayName: 'Tenant A',
        dashboardUrl: 'https://custom.example.com/tenant-a',
      },
      { name: 'tenant-b', displayName: 'Tenant B' },
    ]);

    render(await LandingPage());

    const hrefs = screen
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('https://custom.example.com/tenant-a'); // annotation
    expect(hrefs).toContain('http://localhost:3000/tenant-b'); // derived default
  });

  it('shows an empty state when the user has no accessible namespaces', async () => {
    mockFetch.mockResolvedValue([]);

    render(await LandingPage());

    expect(
      screen.getByText("You don't have access to any ARK namespaces yet."),
    ).toBeInTheDocument();
  });

  it('uses default copy, overridable via env vars', async () => {
    mockFetch.mockResolvedValue([]);

    const { unmount } = render(await LandingPage());
    expect(screen.getByText('ARK')).toBeInTheDocument();
    expect(
      screen.getByText('Agentic Runtime for Kubernetes'),
    ).toBeInTheDocument();
    unmount();

    process.env.LANDING_PAGE_TITLE = 'Acme Platform';
    process.env.LANDING_PAGE_SUBTITLE = 'Pick a workspace';
    render(await LandingPage());
    expect(screen.getByText('Acme Platform')).toBeInTheDocument();
    expect(screen.getByText('Pick a workspace')).toBeInTheDocument();
  });

  it('renders an empty state if discovery throws', async () => {
    mockFetch.mockRejectedValue(new Error('boom'));

    render(await LandingPage());

    expect(
      screen.getByText("You don't have access to any ARK namespaces yet."),
    ).toBeInTheDocument();
  });
});
