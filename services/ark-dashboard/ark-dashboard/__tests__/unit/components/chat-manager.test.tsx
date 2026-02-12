import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import ChatManager from '@/components/chat-manager'

// Mock the FloatingChat component
vi.mock('@/components/floating-chat', () => ({
  default: vi.fn(({ name, onClose }) => (
    <div data-testid={`floating-chat-${name}`}>
      <button onClick={() => onClose(name)}>Close {name}</button>
    </div>
  )),
}))

describe('ChatManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render without chat windows initially', () => {
    render(<ChatManager />)
    
    const chatWindows = screen.queryAllByTestId(/floating-chat-/)
    expect(chatWindows).toHaveLength(0)
  })

  it('should open chat window on open-floating-chat event', async () => {
    render(<ChatManager />)

    // Dispatch open event
    act(() => {
      window.dispatchEvent(
        new CustomEvent('open-floating-chat', {
          detail: {
            name: 'test-agent',
            type: 'agent',
            namespace: 'default',
          },
        })
      )
    })

    await waitFor(() => {
      expect(screen.getByTestId('floating-chat-test-agent')).toBeInTheDocument()
    })
  })

  it('should not open duplicate chat windows', async () => {
    render(<ChatManager />)

    // Dispatch first open event
    act(() => {
      window.dispatchEvent(
        new CustomEvent('open-floating-chat', {
          detail: {
            name: 'test-agent',
            type: 'agent',
            namespace: 'default',
          },
        })
      )
    })

    await waitFor(() => {
      expect(screen.getByTestId('floating-chat-test-agent')).toBeInTheDocument()
    })

    // Dispatch duplicate open event
    act(() => {
      window.dispatchEvent(
        new CustomEvent('open-floating-chat', {
          detail: {
            name: 'test-agent',
            type: 'agent',
            namespace: 'default',
          },
        })
      )
    })

    // Should still have only one chat window
    const chatWindows = screen.getAllByTestId('floating-chat-test-agent')
    expect(chatWindows).toHaveLength(1)
  })

  it('should handle toggle-floating-chat event to open new chat', async () => {
    render(<ChatManager />)

    // Dispatch toggle event for non-existent chat
    act(() => {
      window.dispatchEvent(
        new CustomEvent('toggle-floating-chat', {
          detail: {
            name: 'test-team',
            type: 'team',
            namespace: 'default',
          },
        })
      )
    })

    await waitFor(() => {
      expect(screen.getByTestId('floating-chat-test-team')).toBeInTheDocument()
    })
  })

  it('should handle toggle-floating-chat event to close existing chat', async () => {
    render(<ChatManager />)

    // First open a chat
    act(() => {
      window.dispatchEvent(
        new CustomEvent('open-floating-chat', {
          detail: {
            name: 'test-agent',
            type: 'agent',
            namespace: 'default',
          },
        })
      )
    })

    await waitFor(() => {
      expect(screen.getByTestId('floating-chat-test-agent')).toBeInTheDocument()
    })

    // Toggle to close it
    act(() => {
      window.dispatchEvent(
        new CustomEvent('toggle-floating-chat', {
          detail: {
            name: 'test-agent',
            type: 'agent',
            namespace: 'default',
          },
        })
      )
    })

    await waitFor(() => {
      expect(screen.queryByTestId('floating-chat-test-agent')).not.toBeInTheDocument()
    })
  })

  it('should handle multiple chat windows with correct positions', async () => {
    render(<ChatManager />)

    // Open first chat
    act(() => {
      window.dispatchEvent(
        new CustomEvent('open-floating-chat', {
          detail: {
            name: 'agent1',
            type: 'agent',
            namespace: 'default',
          },
        })
      )

      // Open second chat
      window.dispatchEvent(
        new CustomEvent('open-floating-chat', {
          detail: {
            name: 'agent2',
            type: 'agent',
            namespace: 'default',
          },
        })
      )
    })

    await waitFor(() => {
      expect(screen.getByTestId('floating-chat-agent1')).toBeInTheDocument()
      expect(screen.getByTestId('floating-chat-agent2')).toBeInTheDocument()
    })
  })

  it('should close chat window and update positions', async () => {
    render(<ChatManager />)

    // Open three chats
    act(() => {
      window.dispatchEvent(
        new CustomEvent('open-floating-chat', {
          detail: { name: 'chat1', type: 'agent', namespace: 'default' },
        })
      )
      window.dispatchEvent(
        new CustomEvent('open-floating-chat', {
          detail: { name: 'chat2', type: 'agent', namespace: 'default' },
        })
      )
      window.dispatchEvent(
        new CustomEvent('open-floating-chat', {
          detail: { name: 'chat3', type: 'agent', namespace: 'default' },
        })
      )
    })

    await waitFor(() => {
      expect(screen.getByTestId('floating-chat-chat1')).toBeInTheDocument()
      expect(screen.getByTestId('floating-chat-chat2')).toBeInTheDocument()
      expect(screen.getByTestId('floating-chat-chat3')).toBeInTheDocument()
    })

    // Close the middle chat
    const closeButton = screen.getByText('Close chat2')
    act(() => {
      closeButton.click()
    })

    await waitFor(() => {
      expect(screen.queryByTestId('floating-chat-chat2')).not.toBeInTheDocument()
      expect(screen.getByTestId('floating-chat-chat1')).toBeInTheDocument()
      expect(screen.getByTestId('floating-chat-chat3')).toBeInTheDocument()
    })
  })

  it('should dispatch chat-opened event after opening chat', async () => {
    render(<ChatManager />)
    
    const openedHandler = vi.fn()
    window.addEventListener('chat-opened', openedHandler)

    act(() => {
      window.dispatchEvent(
        new CustomEvent('open-floating-chat', {
          detail: {
            name: 'test-agent',
            type: 'agent',
            namespace: 'default',
          },
        })
      )
    })

    await waitFor(() => {
      expect(openedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: { name: 'test-agent' },
        })
      )
    })

    window.removeEventListener('chat-opened', openedHandler)
  })

  it('should dispatch chat-closed event after closing chat', async () => {
    render(<ChatManager />)
    
    const closedHandler = vi.fn()
    window.addEventListener('chat-closed', closedHandler)

    // Open then toggle to close
    act(() => {
      window.dispatchEvent(
        new CustomEvent('open-floating-chat', {
          detail: {
            name: 'test-agent',
            type: 'agent',
            namespace: 'default',
          },
        })
      )
    })

    await waitFor(() => {
      expect(screen.getByTestId('floating-chat-test-agent')).toBeInTheDocument()
    })

    act(() => {
      window.dispatchEvent(
        new CustomEvent('toggle-floating-chat', {
          detail: {
            name: 'test-agent',
            type: 'agent',
            namespace: 'default',
          },
        })
      )
    })

    await waitFor(() => {
      expect(closedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: { name: 'test-agent' },
        })
      )
    })

    window.removeEventListener('chat-closed', closedHandler)
  })

  it('should clean up event listeners on unmount', () => {
    const { unmount } = render(<ChatManager />)

    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')

    unmount()

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'open-floating-chat',
      expect.any(Function)
    )
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'toggle-floating-chat',
      expect.any(Function)
    )

    removeEventListenerSpy.mockRestore()
  })

  it('should open team chat with strategy', async () => {
    render(<ChatManager />)

    act(() => {
      window.dispatchEvent(
        new CustomEvent('open-floating-chat', {
          detail: {
            name: 'strategy-team',
            type: 'team',
            strategy: 'round-robin',
          },
        })
      )
    })

    await waitFor(() => {
      expect(screen.getByTestId('floating-chat-strategy-team')).toBeInTheDocument()
    })
  })

  it('should toggle team chat with strategy', async () => {
    render(<ChatManager />)

    act(() => {
      window.dispatchEvent(
        new CustomEvent('toggle-floating-chat', {
          detail: {
            name: 'toggle-strategy-team',
            type: 'team',
            strategy: 'round-robin',
          },
        })
      )
    })

    await waitFor(() => {
      expect(screen.getByTestId('floating-chat-toggle-strategy-team')).toBeInTheDocument()
    })

    act(() => {
      window.dispatchEvent(
        new CustomEvent('toggle-floating-chat', {
          detail: {
            name: 'toggle-strategy-team',
            type: 'team',
            strategy: 'round-robin',
          },
        })
      )
    })

    await waitFor(() => {
      expect(screen.queryByTestId('floating-chat-toggle-strategy-team')).not.toBeInTheDocument()
    })
  })
})