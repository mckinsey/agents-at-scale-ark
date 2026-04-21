'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Paperclip, SendHorizontal } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useSendMessage, useListConversations } from '@/lib/services/conversations-hooks';
import { toast } from 'sonner';

interface Props {
  conversationId: string;
  sessionId: string;
}

export function ChatInput({ conversationId, sessionId }: Props) {
  const [message, setMessage] = useState('');
  const [showToolCalls, setShowToolCalls] = useState(false);
  const { mutate: sendMessage, isPending } = useSendMessage();
  const { data: conversations } = useListConversations(sessionId);

  const conversation = conversations?.find(c => c.conversationId === conversationId);
  const participantName = conversation?.name || 'participant';

  const handleSend = () => {
    if (!message.trim() || isPending) return;

    sendMessage(
      {
        conversationId,
        sessionId,
        message: message.trim(),
        agentName: participantName,
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
        <Button variant="ghost" size="icon">
          <Paperclip className="size-4" />
        </Button>

        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Message ${participantName}...`}
          className="min-h-[60px] resize-none"
          disabled={isPending}
        />

        <div className="flex flex-col gap-2">
          <Button
            onClick={handleSend}
            disabled={!message.trim() || isPending}
            size="icon"
          >
            <SendHorizontal className="size-4" />
          </Button>

          <div className="flex items-center gap-1">
            <Checkbox
              id="show-tool-calls"
              checked={showToolCalls}
              onCheckedChange={(checked) => setShowToolCalls(!!checked)}
            />
            <Label htmlFor="show-tool-calls" className="text-xs">
              Tool calls
            </Label>
          </div>
        </div>
      </div>
    </div>
  );
}
