'use client';

import { RotateCcw, Send } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { ChatMessageList } from '@/components/chat/chat-message-list';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { trackEvent } from '@/lib/analytics/singleton';
import { useChatSession } from '@/lib/hooks';
import type { GraphEdge } from '@/lib/types/chat-message';

type ChatType = 'model' | 'team' | 'agent';

interface ChatPanelProps {
  name: string;
  type: ChatType;
  strategy?: string;
  selectorAgentName?: string;
  graphEdges?: GraphEdge[];
  viewMode?: 'text' | 'markdown';
}

export function ChatPanel({
  name,
  type,
  strategy,
  selectorAgentName,
  graphEdges,
  viewMode,
}: ChatPanelProps) {
  const {
    messages,
    isProcessing,
    error,
    sendMessage,
    clearChat,
    messagesEndRef,
  } = useChatSession({ name, type });

  const [currentMessage, setCurrentMessage] = useState('');
  const [debugMode, setDebugMode] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const switchId = useId();

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  useEffect(() => {
    if (!isProcessing) {
      inputRef.current?.focus();
    }
  }, [isProcessing]);

  const handleSendMessage = async () => {
    if (!currentMessage.trim() || isProcessing) return;
    const userMessage = currentMessage.trim();
    setCurrentMessage('');
    inputRef.current?.focus();
    await sendMessage(userMessage);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4" style={{ minHeight: 0 }}>
        <div className="space-y-4">
          <ChatMessageList
            messages={messages}
            type={type}
            strategy={strategy}
            selectorAgentName={selectorAgentName}
            graphEdges={graphEdges}
            debugMode={debugMode}
            isProcessing={isProcessing}
            error={error}
            viewMode={viewMode}
            messagesEndRef={messagesEndRef}
          />
        </div>
      </div>

      <div className="flex-shrink-0 border-t">
        <div className="flex gap-2 p-4">
          <div className="relative flex-1">
            <Input
              ref={inputRef}
              placeholder={
                isProcessing ? 'Processing...' : 'Type your message...'
              }
              value={currentMessage}
              onChange={e => setCurrentMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isProcessing}
            />
          </div>
          <Button
            onClick={handleSendMessage}
            disabled={!currentMessage.trim() || isProcessing}
            size="sm"
            variant="default"
            aria-label="Send message">
            <Send className="h-4 w-4" />
          </Button>
        </div>

        <Separator />

        <div className="px-4 py-2">
          <div className="flex items-center gap-2">
            <Switch
              id={switchId}
              checked={debugMode}
              onCheckedChange={checked => {
                setDebugMode(checked);
                trackEvent({
                  name: 'chat_debug_mode_toggled',
                  properties: {
                    enabled: checked,
                    targetType: type,
                    targetName: name,
                  },
                });
              }}
            />
            <label
              htmlFor={switchId}
              className="text-muted-foreground cursor-pointer text-sm">
              Show tool calls
            </label>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearChat}
              className="ml-auto h-7 gap-1 px-2 text-xs"
              disabled={isProcessing || messages.length === 0}>
              <RotateCcw className="h-3 w-3" />
              New Chat
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
