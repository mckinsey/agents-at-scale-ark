import { AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { useMarkdownProcessor } from '@/lib/hooks/use-markdown-processor';
import { getResourceEventsUrl } from '@/lib/utils/events';

interface ChatMessageProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  queryName?: string;
  className?: string;
  viewMode?: 'text' | 'markdown';
}

export function ChatMessage({
  role,
  content,
  status,
  className,
  viewMode = 'text',
  queryName,
}: Readonly<ChatMessageProps>) {
  const isUser = role === 'user';
  const isFailed = status === 'failed';
  const markdownContent = useMarkdownProcessor(content);
  const router = useRouter();

  const showErrorIcon = isFailed && queryName;

  const handleErrorIconClick = () => {
    if (queryName) {
      const eventsUrl = getResourceEventsUrl('Query', queryName);
      router.push(eventsUrl);
    }
  };

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} ${className || ''}`}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 ${
          isUser
            ? 'bg-primary text-primary-foreground'
            : isFailed
              ? 'bg-destructive/10 text-destructive'
              : 'bg-muted'
        }`}>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            {viewMode === 'markdown' ? (
              <div className="text-sm">{markdownContent}</div>
            ) : (
              <pre className="m-0 border-0 bg-transparent p-0 font-mono text-sm whitespace-pre-wrap">
                {content}
              </pre>
            )}
          </div>
          {showErrorIcon && (
            <button
              onClick={handleErrorIconClick}
              className="hover:bg-destructive/20 flex-shrink-0 rounded p-1 transition-colors"
              title="View events for this query">
              <AlertCircle className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
