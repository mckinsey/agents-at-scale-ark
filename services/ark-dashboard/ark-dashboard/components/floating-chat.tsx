'use client';

import { useAtomValue } from 'jotai';
import {
  AlertCircle,
  Expand,
  MessageCircle,
  Send,
  Shrink,
  X,
} from 'lucide-react';
import type {
  ChatCompletionChunk,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import { useEffect, useRef, useState } from 'react';

import { isChatStreamingEnabledAtom } from '@/atoms/experimental-features';
import { ChatMessage } from '@/components/chat/chat-message';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { chatService } from '@/lib/services';

type ChatType = 'model' | 'team' | 'agent';

interface FloatingChatProps {
  id: string;
  name: string;
  type: ChatType;
  position: number;
  onClose: () => void;
}

export default function FloatingChat({
  name,
  type,
  position,
  onClose,
}: FloatingChatProps) {
  const [chatMessages, setChatMessages] = useState<
    ChatCompletionMessageParam[]
  >([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [viewMode, setViewMode] = useState<'text' | 'markdown'>('markdown');
  const [sessionId] = useState(() => `session-${Date.now()}`);
  const inputRef = useRef<HTMLInputElement>(null);
  const isChatStreamingEnabled = useAtomValue(isChatStreamingEnabledAtom);
  const stopPollingRef = useRef<(() => void) | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    // Focus input when chat opens
    setTimeout(() => inputRef.current?.focus(), 100);

    // Cleanup: stop polling when component unmounts
    return () => {
      if (stopPollingRef.current) {
        stopPollingRef.current();
      }
    };
  }, []);

  useEffect(() => {
    // Focus input when processing completes
    if (!isProcessing) {
      inputRef.current?.focus();
    }
  }, [isProcessing]);

  useEffect(() => {
    // Scroll to bottom when messages change
    setTimeout(scrollToBottom, 100);
  }, [chatMessages]);

  const buildChatMessages = (
    messages: ChatCompletionMessageParam[],
    currentMsg: string,
  ): ChatCompletionMessageParam[] => {
    return [...messages, { role: 'user', content: currentMsg }];
  };

  const handleStreamChatResponse = async (userMessage: string) => {
    const messageArray = buildChatMessages(chatMessages, userMessage);

    // Add empty assistant message that will be updated with streamed content
    const assistantMessageIndex = chatMessages.length + 1; // +1 for user message already added
    setChatMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    let accumulatedContent = '';

    for await (const chunk of chatService.streamChatResponse(
      messageArray,
      type,
      name,
      sessionId,
    )) {
      // Extract content from the chunk (OpenAI format)
      const typedChunk = chunk as unknown as ChatCompletionChunk;
      const delta = typedChunk?.choices?.[0]?.delta;
      if (delta?.content) {
        accumulatedContent += delta.content;

        // Update the assistant message with accumulated content
        setChatMessages(prev => {
          const updated = [...prev];
          updated[assistantMessageIndex] = {
            role: 'assistant',
            content: accumulatedContent,
          };
          return updated;
        });
      }
    }
  };

  const handlePollChatResponse = async (userMessage: string) => {
    const messageArray = buildChatMessages(chatMessages, userMessage);

    // Add empty assistant message that will be updated with streamed content
    // const assistantMessageIndex = chatMessages.length + 1; // +1 for user message already added
    // setChatMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    const query = await chatService.submitChatQuery(
      messageArray,
      type,
      name,
      sessionId,
    );

    let pollingStopped = false;
    stopPollingRef.current = () => {
      pollingStopped = true;
    };

    while (!pollingStopped) {
      try {
        const result = await chatService.getQueryResult(query.name);

        // Check if terminal state with response
        if (result.terminal) {
          let content = '';

          if (result.status === 'done' && result.response) {
            content = result.response;
          } else if (result.status === 'error') {
            content = result.response || 'Query failed';
          } else if (result.status === 'unknown') {
            content = 'Query status unknown';
          }

          setChatMessages(prev => [...prev, { role: 'assistant', content }]);

          pollingStopped = true;
          break;
        }
      } catch (err) {
        console.error('Error polling query status:', err);

        setChatMessages(prev => [
          ...prev,
          { role: 'assistant', content: 'Error while processing query' },
        ]);

        pollingStopped = true;
      }

      if (!pollingStopped) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  };

  const handleSendMessage = async () => {
    if (!currentMessage.trim() || isProcessing) return;

    const userMessage = currentMessage.trim();
    setCurrentMessage('');
    setError(null);

    // Add user message
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);

    // Keep focus on input
    inputRef.current?.focus();

    setIsProcessing(true);

    try {
      if (isChatStreamingEnabled) {
        await handleStreamChatResponse(userMessage);
      } else {
        await handlePollChatResponse(userMessage);
      }
    } catch (err) {
      console.error('Error sending message:', err);
      let errorMessage = 'Failed to send message';

      if (err instanceof Error) {
        if (err.message.includes('Failed to fetch')) {
          errorMessage =
            'Unable to connect to the ARK API. Please ensure the backend service is running on port 8000.';
        } else {
          errorMessage = err.message;
        }
      }

      setError(errorMessage);
      setIsProcessing(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Calculate position - each window is 420px wide (400px + 20px gap)
  const rightPosition = 16 + position * 420;

  // Handle maximize/minimize styling
  const cardStyles = isMaximized
    ? 'fixed inset-4 shadow-2xl z-50 transition-all duration-300'
    : 'fixed bottom-4 shadow-2xl z-50 w-[400px] h-[500px] transition-all duration-300';

  return (
    <Card
      className={`${cardStyles} p-0`}
      style={isMaximized ? {} : { right: `${rightPosition}px` }}>
      <div className="flex h-full flex-col overflow-hidden">
        {/* Dialog-style Header */}
        <div className="flex-shrink-0 border-b">
          {/* Title Row */}
          <div className="flex items-center justify-between px-3 py-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <MessageCircle className="text-muted-foreground h-4 w-4 flex-shrink-0" />
                    <span className="truncate font-medium">{name}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{name}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <div className="ml-2 flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMaximized(!isMaximized)}
                className="h-6 w-6 p-0"
                title={isMaximized ? 'Minimize chat' : 'Maximize chat'}>
                {isMaximized ? (
                  <Shrink className="h-3 w-3" />
                ) : (
                  <Expand className="h-3 w-3" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-6 w-6 p-0"
                title="Close chat">
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>

          <Separator />

          {/* Controls Row */}
          <div className="flex justify-end px-3 py-1.5">
            <div className="flex items-center gap-1 text-xs">
              <button
                className={`rounded px-2 py-1 transition-colors ${
                  viewMode === 'text'
                    ? 'bg-secondary text-secondary-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
                onClick={() => setViewMode('text')}>
                Text
              </button>
              <button
                className={`rounded px-2 py-1 transition-colors ${
                  viewMode === 'markdown'
                    ? 'bg-secondary text-secondary-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
                onClick={() => setViewMode('markdown')}>
                Markdown
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4" style={{ minHeight: 0 }}>
          <div className="space-y-4">
            {error && (
              <div className="text-destructive bg-destructive/10 flex items-center gap-2 rounded-md p-3 text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {chatMessages.length === 0 && !error && (
              <div className="text-muted-foreground py-8 text-center">
                Start a conversation with the {type}
              </div>
            )}

            {chatMessages.map((message, index) => {
              // Extract string content from message
              let content = '';
              if (typeof message.content === 'string') {
                content = message.content;
              } else if (Array.isArray(message.content)) {
                // For multimodal content, extract text parts
                content = message.content
                  .filter(
                    part =>
                      typeof part === 'object' &&
                      part !== null &&
                      'type' in part &&
                      part.type === 'text',
                  )
                  .map(part =>
                    typeof part === 'object' && part !== null && 'text' in part
                      ? part.text
                      : '',
                  )
                  .join('\n');
              }

              return content ? (
                <ChatMessage
                  key={index}
                  role={message.role as 'user' | 'assistant' | 'system'}
                  content={content}
                  viewMode={viewMode}
                />
              ) : null;
            })}

            {/* Show typing indicator when processing */}
            {isProcessing && (
              <div className="flex justify-start">
                <div className="bg-muted max-w-[80%] rounded-lg px-3 py-2">
                  <div className="flex space-x-1">
                    <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400"></div>
                    <div
                      className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
                      style={{ animationDelay: '0.1s' }}></div>
                    <div
                      className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
                      style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="flex flex-shrink-0 gap-2 border-t p-4">
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
      </div>
    </Card>
  );
}
