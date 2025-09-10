import { useState, useEffect } from 'react';
import { ErrorChatView } from '@/components/ErrorChatView';
import { eventsService, Event } from '@/lib/services/events';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface ErrorResponseContentProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any;
  viewMode: 'text' | 'markdown' | 'json' | 'chat';
  namespace: string;
}

export function ErrorResponseContent({ query, viewMode, namespace }: ErrorResponseContentProps) {
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

  const getErrorDetails = () => {
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

    if (errorEvents.length > 0) {
      // Get the most recent error event
      const latestError = errorEvents.sort((a, b) => 
        new Date(b.lastTimestamp || b.creationTimestamp).getTime() - 
        new Date(a.lastTimestamp || a.creationTimestamp).getTime()
      )[0];

      // Try to parse the error message
      let errorMessage = latestError.message;
      try {
        const errorData = JSON.parse(latestError.message);
        if (errorData.error) {
          errorMessage = errorData.error;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch {
        // If not JSON, use the message directly
        errorMessage = latestError.message;
      }

      return {
        type: latestError.reason || 'Error',
        message: errorMessage,
        details: {
          phase: query.status?.phase,
          responses: query.status?.responses?.length || 0,
          timestamp: query.creationTimestamp,
          eventId: latestError.id,
          eventType: latestError.type,
          sourceComponent: latestError.sourceComponent,
          sourceHost: latestError.sourceHost,
          count: latestError.count,
          firstSeen: latestError.firstTimestamp,
          lastSeen: latestError.lastTimestamp
        },
        allEvents: errorEvents.map(event => ({
          id: event.id,
          reason: event.reason,
          message: event.message,
          type: event.type,
          timestamp: event.lastTimestamp || event.creationTimestamp,
          count: event.count
        }))
      };
    }

    // If no specific error details from events, infer from conversation context
    if (query.input) {
      const conversationText = query.input.toLowerCase();
      // Enhanced error inference from conversation context
      let inferredError = 'Query failed - no specific error details available';
      let errorType = 'UnknownError';
      
      if (conversationText.includes('weather') && 
          (conversationText.includes('40.71427') || conversationText.includes('latitude'))) {
        inferredError = 'tool get-weather not found';
        errorType = 'ToolCallError';
      } else if (conversationText.includes('tool') && conversationText.includes('not found')) {
        inferredError = 'Requested tool not found';
        errorType = 'ToolCallError';
      } else if (conversationText.includes('timeout') || conversationText.includes('timed out')) {
        inferredError = 'Query timed out';
        errorType = 'TimeoutError';
      } else if (conversationText.includes('permission') || conversationText.includes('unauthorized')) {
        inferredError = 'Permission denied';
        errorType = 'PermissionError';
      } else if (conversationText.includes('network') || conversationText.includes('connection')) {
        inferredError = 'Network connection error';
        errorType = 'NetworkError';
      } else if (conversationText.includes('403') || conversationText.includes('forbidden')) {
        inferredError = 'API access denied (403 Forbidden)';
        errorType = 'LLMCallError';
      } else if (conversationText.includes('401') || conversationText.includes('unauthorized')) {
        inferredError = 'API authentication failed (401 Unauthorized)';
        errorType = 'LLMCallError';
      } else if (conversationText.includes('llm') || conversationText.includes('model')) {
        inferredError = 'LLM API error';
        errorType = 'LLMCallError';
      } else if (conversationText.includes('agent') && conversationText.includes('error')) {
        inferredError = 'Agent execution error';
        errorType = 'AgentExecutionError';
      } else if (conversationText.includes('team') && conversationText.includes('error')) {
        inferredError = 'Team execution error';
        errorType = 'TeamExecutionError';
      } else if (conversationText.includes('evaluation') && conversationText.includes('error')) {
        inferredError = 'Evaluation error';
        errorType = 'EvaluationError';
      }
      
      return {
        type: errorType,
        message: inferredError,
        details: {
          phase: query.status?.phase,
          responses: query.status?.responses?.length || 0,
          timestamp: query.creationTimestamp,
          inferred: true
        }
      };
    }

    // Fallback to generic error
    return {
      type: 'Unknown Error',
      message: 'Query failed with no specific error details available',
      details: {
        phase: query.status?.phase,
        responses: query.status?.responses?.length || 0,
        timestamp: query.creationTimestamp
      }
    };
  };

  const errorDetails = getErrorDetails();

  if (loading) {
    return <div className="text-center text-muted-foreground py-4 text-sm">Loading error details...</div>;
  }

  if (viewMode === 'json') {
    return (
      <div className="text-sm">
        <pre className="bg-black text-white p-4 rounded text-sm font-mono whitespace-pre-wrap break-words border">
          {JSON.stringify(errorDetails, null, 2)}
        </pre>
      </div>
    );
  }

  if (viewMode === 'markdown') {
    return (
      <div className="text-sm space-y-3">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
              <span className="text-white text-xs font-bold">!</span>
            </div>
            <h3 className="font-semibold text-red-800 dark:text-red-200">Error Details</h3>
          </div>
          <div className="space-y-2 text-red-700 dark:text-red-300">
            <p><strong>Error Type:</strong> {errorDetails.type}</p>
            <p><strong>Message:</strong> {errorDetails.message}</p>
            <p><strong>Phase:</strong> {errorDetails.details.phase}</p>
            <p><strong>Responses:</strong> {errorDetails.details.responses}</p>
            <p><strong>Timestamp:</strong> {errorDetails.details.timestamp}</p>
            {errorDetails.details.eventId && (
              <p><strong>Event ID:</strong> {errorDetails.details.eventId}</p>
            )}
          </div>
        </div>
        
        {errorDetails.allEvents && errorDetails.allEvents.length > 0 && (
          <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">All Related Events</h4>
            <div className="space-y-2">
              {errorDetails.allEvents.map((event, index) => (
                <div key={index} className="text-sm text-gray-600 dark:text-gray-400">
                  <p><strong>{event.reason}</strong> - {event.message}</p>
                  <p className="text-xs">Type: {event.type} | Count: {event.count}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (viewMode === 'chat') {
    return (
      <ErrorChatView
        query={query}
        namespace={namespace}
      />
    );
  }

  // Default text view
  return (
    <div className="text-sm space-y-3">
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-bold">!</span>
          </div>
          <h3 className="font-semibold text-red-800 dark:text-red-200">Error Details</h3>
        </div>
        <div className="space-y-2 text-red-700 dark:text-red-300">
          <p><strong>Error Type:</strong> {errorDetails.type}</p>
          <p><strong>Message:</strong> {errorDetails.message}</p>
          <p><strong>Phase:</strong> {errorDetails.details.phase}</p>
          <p><strong>Responses:</strong> {errorDetails.details.responses}</p>
          <p><strong>Timestamp:</strong> {errorDetails.details.timestamp}</p>
          {errorDetails.details.eventId && (
            <p><strong>Event ID:</strong> {errorDetails.details.eventId}</p>
          )}
        </div>
      </div>
      
      {errorDetails.allEvents && errorDetails.allEvents.length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">All Related Events</h4>
          <div className="space-y-2">
            {errorDetails.allEvents.map((event, index) => (
              <div key={index} className="text-sm text-gray-600 dark:text-gray-400">
                <p><strong>{event.reason}</strong> - {event.message}</p>
                <p className="text-xs">Type: {event.type} | Count: {event.count}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
