import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MemoryChatNotice } from '@/components/chat/memory-chat-notice';

describe('MemoryChatNotice', () => {
  it('leads the unavailable case and keeps the condition message verbatim', () => {
    render(
      <MemoryChatNotice
        notice={{
          type: 'MemoryUnavailable',
          message:
            'conversationId was set but no Memory backend was reachable; conversation history was disabled for this query',
        }}
      />,
    );

    expect(
      screen.getByText(/This chat is not keeping conversation history\./),
    ).toHaveTextContent(
      'This chat is not keeping conversation history. conversationId was set but no Memory backend was reachable; conversation history was disabled for this query',
    );
  });

  it('leads the degraded case differently', () => {
    render(
      <MemoryChatNotice
        notice={{
          type: 'MemoryDegraded',
          message: 'failed to read conversation history from the backend',
        }}
      />,
    );

    expect(
      screen.getByText(/Conversation history could not be read\./),
    ).toHaveTextContent(
      'Conversation history could not be read. failed to read conversation history from the backend',
    );
    expect(screen.queryByText(/is not keeping/)).not.toBeInTheDocument();
  });
});
