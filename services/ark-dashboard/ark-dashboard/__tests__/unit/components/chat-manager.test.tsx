import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ChatManager from '@/components/chat-manager';

// Mock the FloatingChat component
vi.mock('@/components/floating-chat', () => ({
  default: vi.fn(({ name, onClose }) => (
    <div data-testid={`floating-chat-${name}`}>
      <button onClick={() => onClose(name)}>Close {name}</button>
    </div>
  )),
}));

function dispatchChatEvent(
  type: 'open-floating-chat' | 'toggle-floating-chat',
  detail: Record<string, unknown>,
) {
  window.dispatchEvent(new CustomEvent(type, { detail }));
}

const agentDetail = (name: string) => ({
  name,
  type: 'agent',
  namespace: 'default',
});

describe('ChatManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without chat windows initially', () => {
    render(<ChatManager />);

    const chatWindows = screen.queryAllByTestId(/floating-chat-/);
    expect(chatWindows).toHaveLength(0);
  });

  it('should open chat window on open-floating-chat event', async () => {
    render(<ChatManager />);

    act(() => {
      dispatchChatEvent('open-floating-chat', agentDetail('test-agent'));
    });

    await waitFor(() => {
      expect(
        screen.getByTestId('floating-chat-test-agent'),
      ).toBeInTheDocument();
    });
  });

  it('should not open duplicate chat windows', async () => {
    render(<ChatManager />);

    act(() => {
      dispatchChatEvent('open-floating-chat', agentDetail('test-agent'));
    });

    await waitFor(() => {
      expect(
        screen.getByTestId('floating-chat-test-agent'),
      ).toBeInTheDocument();
    });

    act(() => {
      dispatchChatEvent('open-floating-chat', agentDetail('test-agent'));
    });

    // Should still have only one chat window
    const chatWindows = screen.getAllByTestId('floating-chat-test-agent');
    expect(chatWindows).toHaveLength(1);
  });

  it('should handle toggle-floating-chat event to open new chat', async () => {
    render(<ChatManager />);

    act(() => {
      dispatchChatEvent('toggle-floating-chat', {
        name: 'test-team',
        type: 'team',
        namespace: 'default',
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('floating-chat-test-team')).toBeInTheDocument();
    });
  });

  it('should handle toggle-floating-chat event to close existing chat', async () => {
    render(<ChatManager />);

    act(() => {
      dispatchChatEvent('open-floating-chat', agentDetail('test-agent'));
    });

    await waitFor(() => {
      expect(
        screen.getByTestId('floating-chat-test-agent'),
      ).toBeInTheDocument();
    });

    act(() => {
      dispatchChatEvent('toggle-floating-chat', agentDetail('test-agent'));
    });

    await waitFor(() => {
      expect(
        screen.queryByTestId('floating-chat-test-agent'),
      ).not.toBeInTheDocument();
    });
  });

  it('should handle multiple chat windows with correct positions', async () => {
    render(<ChatManager />);

    act(() => {
      dispatchChatEvent('open-floating-chat', agentDetail('agent1'));
      dispatchChatEvent('open-floating-chat', agentDetail('agent2'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('floating-chat-agent1')).toBeInTheDocument();
      expect(screen.getByTestId('floating-chat-agent2')).toBeInTheDocument();
    });
  });

  it('should close chat window and update positions', async () => {
    render(<ChatManager />);

    act(() => {
      dispatchChatEvent('open-floating-chat', agentDetail('chat1'));
      dispatchChatEvent('open-floating-chat', agentDetail('chat2'));
      dispatchChatEvent('open-floating-chat', agentDetail('chat3'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('floating-chat-chat1')).toBeInTheDocument();
      expect(screen.getByTestId('floating-chat-chat2')).toBeInTheDocument();
      expect(screen.getByTestId('floating-chat-chat3')).toBeInTheDocument();
    });

    // Close the middle chat
    const closeButton = screen.getByText('Close chat2');
    act(() => {
      closeButton.click();
    });

    await waitFor(() => {
      expect(
        screen.queryByTestId('floating-chat-chat2'),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId('floating-chat-chat1')).toBeInTheDocument();
      expect(screen.getByTestId('floating-chat-chat3')).toBeInTheDocument();
    });
  });

  it('should dispatch chat-opened event after opening chat', async () => {
    render(<ChatManager />);

    const openedHandler = vi.fn();
    window.addEventListener('chat-opened', openedHandler);

    act(() => {
      dispatchChatEvent('open-floating-chat', agentDetail('test-agent'));
    });

    await waitFor(() => {
      expect(openedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: { name: 'test-agent' },
        }),
      );
    });

    window.removeEventListener('chat-opened', openedHandler);
  });

  it('should dispatch chat-closed event after closing chat', async () => {
    render(<ChatManager />);

    const closedHandler = vi.fn();
    window.addEventListener('chat-closed', closedHandler);

    act(() => {
      dispatchChatEvent('open-floating-chat', agentDetail('test-agent'));
    });

    await waitFor(() => {
      expect(
        screen.getByTestId('floating-chat-test-agent'),
      ).toBeInTheDocument();
    });

    act(() => {
      dispatchChatEvent('toggle-floating-chat', agentDetail('test-agent'));
    });

    await waitFor(() => {
      expect(closedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: { name: 'test-agent' },
        }),
      );
    });

    window.removeEventListener('chat-closed', closedHandler);
  });

  it('should clean up event listeners on unmount', () => {
    const { unmount } = render(<ChatManager />);

    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'open-floating-chat',
      expect.any(Function),
    );
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'toggle-floating-chat',
      expect.any(Function),
    );

    removeEventListenerSpy.mockRestore();
  });

  it('should open team chat with strategy', async () => {
    render(<ChatManager />);

    act(() => {
      dispatchChatEvent('open-floating-chat', {
        name: 'strategy-team',
        type: 'team',
        strategy: 'round-robin',
      });
    });

    await waitFor(() => {
      expect(
        screen.getByTestId('floating-chat-strategy-team'),
      ).toBeInTheDocument();
    });
  });

  it('should toggle team chat with strategy', async () => {
    render(<ChatManager />);

    const toggleDetail = {
      name: 'toggle-strategy-team',
      type: 'team',
      strategy: 'round-robin',
    };

    act(() => {
      dispatchChatEvent('toggle-floating-chat', toggleDetail);
    });

    await waitFor(() => {
      expect(
        screen.getByTestId('floating-chat-toggle-strategy-team'),
      ).toBeInTheDocument();
    });

    act(() => {
      dispatchChatEvent('toggle-floating-chat', toggleDetail);
    });

    await waitFor(() => {
      expect(
        screen.queryByTestId('floating-chat-toggle-strategy-team'),
      ).not.toBeInTheDocument();
    });
  });
});
