import { render, screen, waitFor } from '@testing-library/react';
import LandingPage from '../page';

global.fetch = jest.fn();

describe('LandingPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading state initially', () => {
    (global.fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));
    
    render(<LandingPage />);
    
    expect(screen.getByText('Loading demos...')).toBeInTheDocument();
  });

  it('renders demos when fetch succeeds', async () => {
    const mockDemos = [
      {
        name: 'demo1',
        displayName: 'Demo 1',
        description: 'Test demo 1',
      },
      {
        name: 'demo2',
        displayName: 'Demo 2',
        description: 'Test demo 2',
      },
    ];

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockDemos,
    });

    render(<LandingPage />);

    await waitFor(() => {
      expect(screen.getByText('Demo 1')).toBeInTheDocument();
      expect(screen.getByText('Demo 2')).toBeInTheDocument();
      expect(screen.getByText('Test demo 1')).toBeInTheDocument();
      expect(screen.getByText('Test demo 2')).toBeInTheDocument();
    });
  });

  it('renders error state when fetch fails', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    render(<LandingPage />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load demos. Check console for details.')).toBeInTheDocument();
    });
  });

  it('renders error when API returns error response', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    render(<LandingPage />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load demos. Check console for details.')).toBeInTheDocument();
    });
  });

  it('renders message when no demos available', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    render(<LandingPage />);

    await waitFor(() => {
      expect(screen.getByText('No demos available at the moment.')).toBeInTheDocument();
    });
  });

  it('renders page title and description', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    render(<LandingPage />);

    await waitFor(() => {
      expect(screen.getByText('ARK Demos')).toBeInTheDocument();
      expect(screen.getByText('Explore agentic AI demonstrations')).toBeInTheDocument();
    });
  });
});
