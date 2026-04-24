'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SendHorizontal } from 'lucide-react';
import { useSendMessage } from '@/lib/services/conversations-hooks';
import type { Conversation } from '@/lib/services/conversations';
import { toast } from 'sonner';

const FALLBACK_PARTICIPANT_NAME = 'participant';

interface Props {
  conversationId: string;
  sessionId: string;
  conversation: Conversation | null;
}

export function ChatInput({ conversationId, sessionId, conversation }: Props) {
  const [message, setMessage] = useState('');
  const { mutate: sendMessage, isPending } = useSendMessage();

  const participantName = conversation?.name || FALLBACK_PARTICIPANT_NAME;
  const participantType = conversation?.participantType;

  const handleSend = () => {
    if (!message.trim() || isPending) return;

    sendMessage(
      {
        conversationId,
        sessionId,
        message: message.trim(),
        agentName: participantName,
        participantType,
      },
      {
        onSuccess: () => {
          setMessage('');
          toast.success('Message sent');
        },
        onError: (error) => {
          toast.error('Failed to send message', {
            description: error instanceof Error ? error.message : 'Unknown error',
          });
        },
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t p-4">
      <div className="flex gap-2">
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Message ${participantName}...`}
          className="min-h-[60px] resize-none"
          disabled={isPending}
        />

        <Button
          onClick={handleSend}
          disabled={!message.trim() || isPending}
          size="icon"
        >
          <SendHorizontal className="size-4" />
        </Button>
      </div>
    </div>
  );
}
