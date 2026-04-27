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
  readonly conversationId: string;
  readonly sessionId: string;
  readonly conversation: Conversation | null;
  readonly onAddPendingMessage: (conversationId: string, content: string) => void;
  readonly onSetProcessing: (conversationId: string, isProcessing: boolean) => void;
  readonly onEnableQueries: () => void;
  readonly hasTempSession: boolean;
}

export function ChatInput({ conversationId, sessionId, conversation, onAddPendingMessage, onSetProcessing, onEnableQueries, hasTempSession }: Props) {
  const [message, setMessage] = useState('');
  const { mutate: sendMessage, isPending } = useSendMessage();

  const participantName = conversation?.participants?.[0] || conversation?.name || FALLBACK_PARTICIPANT_NAME;
  const participantType = conversation?.participantType;

  // Don't render chat input for workflow conversations (multiple different participants)
  // In workflows, we don't know which agent to target for new messages
  const participantCount = conversation?.participants?.length || 0;
  const isWorkflowConversation = participantCount > 1;

  if (isWorkflowConversation) {
    // Don't render anything - workflows are not conversational
    return null;
  }

  const handleSend = () => {
    if (!message.trim() || isPending) return;

    const messageToSend = message.trim();

    onAddPendingMessage(conversationId, messageToSend);
    setMessage('');
    onSetProcessing(conversationId, true);

    sendMessage(
      {
        conversationId,
        sessionId,
        message: messageToSend,
        agentName: participantName,
        participantType,
      },
      {
        onSuccess: () => {
          if (hasTempSession) {
            onEnableQueries();
          }
        },
        onError: (error) => {
          onSetProcessing(conversationId, false);
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
