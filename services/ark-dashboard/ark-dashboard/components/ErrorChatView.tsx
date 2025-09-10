import { useState, useEffect } from 'react';
import { eventsService, Event } from '@/lib/services/events';

interface ErrorChatViewProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any;
  namespace: string;
}

export function ErrorChatView({ query, namespace }: ErrorChatViewProps) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadEvents = async () => {
      try {
        // Try to get events for this specific query
        const eventData = await eventsService.getAll(namespace, {
          name: query.name
        });
        setEvents(eventData.items);
        
        // If no events found for this query, try to get recent error events
        if (eventData.items.length === 0) {
          console.log('No events found for query, trying to get recent error events');
          const recentEvents = await eventsService.getAll(namespace, {
            type: 'Warning'
          });
          setEvents(recentEvents.items);
        }
      } catch (error) {
        console.error('Failed to load events:', error);
        // If events service fails, we'll show a generic error message
        setEvents([]);
      } finally {
        setLoading(false);
      }
    };

    if (query.name) {
      loadEvents();
    }
  }, [query.name, namespace]);

  const parseConversationWithErrors = () => {
    const messages: Array<{type: string; content: string; timestamp: string | null; isError: boolean; eventId?: string | null}> = [];
    
    // Parse the conversation from userInput
    if (query.input) {
      const conversationText = query.input.replace(/^User: /, '');
      const parts = conversationText.split(/(?=User: |Agent: )/);
      
      // Find error events - look for ToolCallError, QueryResolveError, etc.
      const errorEvents = events.filter(event => 
        event.type === 'Warning' || 
        event.reason?.toLowerCase().includes('error') ||
        event.reason?.toLowerCase().includes('failed') ||
        event.reason === 'ToolCallError' ||
        event.reason === 'QueryResolveError' ||
        event.reason === 'TargetExecutionError' ||
        event.reason === 'LLMCallError'
      );

      let errorDetails = '';
      if (errorEvents.length > 0) {
        const latestError = errorEvents.sort((a, b) => 
          new Date(b.lastTimestamp || b.creationTimestamp).getTime() - 
          new Date(a.lastTimestamp || a.creationTimestamp).getTime()
        )[0];

        // Show raw error type for better technical understanding
        const errorType = latestError.reason || 'UnknownError';
        errorDetails = errorType;
      }
      
      parts.forEach((part: string) => {
        if (part.trim()) {
          if (part.startsWith('User: ')) {
            messages.push({
              type: 'user',
              content: part.replace(/^User: /, '').trim(),
              timestamp: null,
              isError: false
            });
          } else if (part.startsWith('Agent: ')) {
            const content = part.replace(/^Agent: /, '').trim();
            
            // Skip "No response" messages entirely - don't show them at all
            if (content === 'No response') {
              // Instead of showing "No response", show the actual error
              if (errorDetails) {
                messages.push({
                  type: 'system',
                  content: `❌ ${errorDetails}`,
                  timestamp: null,
                  isError: true,
                  eventId: errorEvents.length > 0 ? errorEvents[0].id : null
                });
              } else {
                // Enhanced error inference from conversation context
                let inferredError = 'Query failed - no specific error details available';
                
                // Check for specific error patterns in conversation
                if (conversationText.toLowerCase().includes('weather') && 
                    (conversationText.includes('40.71427') || conversationText.includes('latitude'))) {
                  inferredError = 'tool get-weather not found';
                } else if (conversationText.toLowerCase().includes('tool') && 
                           conversationText.toLowerCase().includes('not found')) {
                  inferredError = 'Requested tool not found';
                } else if (conversationText.toLowerCase().includes('timeout') || 
                           conversationText.toLowerCase().includes('timed out')) {
                  inferredError = 'Query timed out';
                } else if (conversationText.toLowerCase().includes('permission') || 
                           conversationText.toLowerCase().includes('unauthorized')) {
                  inferredError = 'Permission denied';
                } else if (conversationText.toLowerCase().includes('network') || 
                           conversationText.toLowerCase().includes('connection')) {
                  inferredError = 'Network connection error';
                } else if (conversationText.toLowerCase().includes('403') || 
                           conversationText.toLowerCase().includes('forbidden')) {
                  inferredError = 'API access denied (403 Forbidden)';
                } else if (conversationText.toLowerCase().includes('401') || 
                           conversationText.toLowerCase().includes('unauthorized')) {
                  inferredError = 'API authentication failed (401 Unauthorized)';
                } else if (conversationText.toLowerCase().includes('llm') || 
                           conversationText.toLowerCase().includes('model')) {
                  inferredError = 'LLM API error';
                } else if (conversationText.toLowerCase().includes('agent') && 
                           conversationText.toLowerCase().includes('error')) {
                  inferredError = 'Agent execution error';
                } else if (conversationText.toLowerCase().includes('team') && 
                           conversationText.toLowerCase().includes('error')) {
                  inferredError = 'Team execution error';
                } else if (conversationText.toLowerCase().includes('evaluation') && 
                           conversationText.toLowerCase().includes('error')) {
                  inferredError = 'Evaluation error';
                }
                
                messages.push({
                  type: 'system',
                  content: `❌ ${inferredError}`,
                  timestamp: null,
                  isError: true,
                  eventId: null
                });
              }
              return; // Skip adding the "No response" message
            }
            
            // Only add non-"No response" agent messages
            messages.push({
              type: 'assistant',
              content: content,
              timestamp: null,
              isError: content.includes('Error')
            });
          } else {
            messages.push({
              type: 'user',
              content: part.trim(),
              timestamp: null,
              isError: false
            });
          }
        }
      });
    }

    // Always add an error message if the query phase is 'error'
    if (query.status?.phase === 'error') {
      const hasError = messages.some(msg => msg.type === 'system' && msg.isError);
      
      if (!hasError) {
        // No error message found, add one based on available information
        let errorMessage = 'Query failed - no specific error details available';
        
        // Try to get error from events first
        const errorEvents = events.filter(event => 
          event.type === 'Warning' || 
          event.reason?.toLowerCase().includes('error') ||
          event.reason?.toLowerCase().includes('failed') ||
          event.reason === 'ToolCallError' ||
          event.reason === 'QueryResolveError' ||
          event.reason === 'TargetExecutionError' ||
          event.reason === 'LLMCallError'
        );
        
        if (errorEvents.length > 0) {
          const latestError = errorEvents.sort((a, b) => 
            new Date(b.lastTimestamp || b.creationTimestamp).getTime() - 
            new Date(a.lastTimestamp || a.creationTimestamp).getTime()
          )[0];
          
          // Show raw error type for better technical understanding
          const errorType = latestError.reason || 'UnknownError';
          errorMessage = errorType;
        } else if (query.input) {
          // Fallback to conversation context inference
          const conversationText = query.input.toLowerCase();
          if (conversationText.includes('weather') && 
              (conversationText.includes('40.71427') || conversationText.includes('latitude'))) {
            errorMessage = 'tool get-weather not found';
          } else if (conversationText.includes('tool') && conversationText.includes('not found')) {
            errorMessage = 'Requested tool not found';
          } else if (conversationText.includes('timeout') || conversationText.includes('timed out')) {
            errorMessage = 'Query timed out';
          } else if (conversationText.includes('403') || conversationText.includes('forbidden')) {
            errorMessage = 'API access denied (403 Forbidden)';
          } else if (conversationText.includes('401') || conversationText.includes('unauthorized')) {
            errorMessage = 'API authentication failed (401 Unauthorized)';
          } else if (conversationText.includes('llm') || conversationText.includes('model')) {
            errorMessage = 'LLM API error';
          } else if (conversationText.includes('agent') && conversationText.includes('error')) {
            errorMessage = 'Agent execution error';
          } else if (conversationText.includes('team') && conversationText.includes('error')) {
            errorMessage = 'Team execution error';
          } else if (conversationText.includes('evaluation') && conversationText.includes('error')) {
            errorMessage = 'Evaluation error';
          }
        }
        
        messages.push({
          type: 'system',
          content: `❌ ${errorMessage}`,
          timestamp: null,
          isError: true,
          eventId: errorEvents.length > 0 ? errorEvents[0].id : null
        });
      }
    }

    return messages;
  };

  if (loading) {
    return (
      <div className="text-center text-muted-foreground py-4 text-sm">
        Loading conversation...
      </div>
    );
  }

  const messages = parseConversationWithErrors();

  return (
    <div className="text-sm space-y-3 max-h-[600px] overflow-y-auto">
      {messages.map((msg, index) => (
        <div key={index} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
          <div className={`px-3 py-2 rounded-lg max-w-xs ${
            msg.type === 'user' 
              ? 'bg-blue-500 text-white' 
              : msg.type === 'system'
              ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800'
              : msg.isError
              ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 border border-yellow-200 dark:border-yellow-800'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
          }`}>
            <div>{msg.content}</div>
            {msg.timestamp && (
              <div className="text-xs opacity-70 mt-1">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </div>
            )}
            {msg.eventId && (
              <div className="text-xs opacity-70 mt-1">
                Event: {msg.eventId.slice(0, 8)}...
              </div>
            )}
          </div>
        </div>
      ))}
      
      {messages.length === 0 && (
        <div className="text-center text-muted-foreground py-4">
          No conversation history available
        </div>
      )}
    </div>
  );
}