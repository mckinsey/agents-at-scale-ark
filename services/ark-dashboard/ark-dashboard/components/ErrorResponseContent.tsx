import { useEffect, useState } from 'react';

import type { Event } from '@/lib/services/events';
import { eventsService } from '@/lib/services/events';

interface ErrorResponseContentProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any;
  viewMode: 'events' | 'details';
}

export function ErrorResponseContent({
  query,
  viewMode,
}: ErrorResponseContentProps) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadEvents = async () => {
      try {
        // Try to get events for this specific query
        const eventData = await eventsService.getAll({
          name: query.name,
        });
        setEvents(eventData.items);

        // If no events found for this query, try to get recent error events
        if (eventData.items.length === 0) {
          console.log(
            'No events found for query, trying to get recent error events',
          );
          const recentEvents = await eventsService.getAll({
            type: 'Warning',
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
  }, [query.name]);

  const getErrorDetails = () => {
    // Find error events - look for ToolCallError, QueryResolveError, etc.
    const errorEvents = events.filter(
      event =>
        event.message &&
        event.message.trim() !== '' &&
        (event.reason?.toLowerCase().includes('error') ||
          event.reason?.toLowerCase().includes('failed') ||
          event.reason === 'ToolCallError' ||
          event.reason === 'QueryResolveError' ||
          event.reason === 'TargetExecutionError' ||
          event.reason === 'LLMCallError') &&
        !event.message.toLowerCase().includes('rebooted') &&
        !event.message.toLowerCase().includes('minikube'),
    );

    // If we have valid error events, use them
    if (
      errorEvents.length > 0 &&
      errorEvents.some(event => event.message && event.message.trim() !== '')
    ) {
      // Get the most recent error event
      const latestError = errorEvents.sort(
        (a, b) =>
          new Date(b.lastTimestamp || b.creationTimestamp).getTime() -
          new Date(a.lastTimestamp || a.creationTimestamp).getTime(),
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
          response: query.status?.response ? 'Available' : 'None',
          timestamp: query.creationTimestamp,
          eventId: latestError.id,
          eventType: latestError.type,
          sourceComponent: latestError.sourceComponent,
          sourceHost: latestError.sourceHost,
          count: latestError.count,
          firstSeen: latestError.firstTimestamp,
          lastSeen: latestError.lastTimestamp,
        },
        allEvents: errorEvents.map(event => ({
          id: event.id,
          reason: event.reason,
          message: event.message,
          type: event.type,
          timestamp: event.lastTimestamp || event.creationTimestamp,
          count: event.count,
        })),
      };
    }

    // Only show error if query is actually failed/error
    if (query.status?.phase === 'failed' || query.status?.phase === 'error') {
      return {
        type: 'Unknown Error',
        message: 'Query failed - no specific error details available',
        details: {
          phase: query.status?.phase,
          response: query.status?.response ? 'Available' : 'None',
          timestamp: query.creationTimestamp,
        },
      };
    }

    // For running queries, return null to not show error
    return null;
  };

  const errorDetails = getErrorDetails();

  if (loading) {
    return (
      <div className="text-muted-foreground py-4 text-center text-sm">
        Loading error details...
      </div>
    );
  }

  // If no error details (e.g., for running queries), don't show anything
  if (!errorDetails) {
    return null;
  }

  if (viewMode === 'details') {
    return (
      <div className="text-sm">
        <pre className="rounded border bg-black p-4 font-mono text-sm break-words whitespace-pre-wrap text-white">
          {JSON.stringify(errorDetails, null, 2)}
        </pre>
      </div>
    );
  }

  if (viewMode === 'events') {
    return (
      <div className="space-y-3 text-sm">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500">
              <span className="text-xs font-bold text-white">!</span>
            </div>
            <h3 className="font-semibold text-red-800 dark:text-red-200">
              Error Details
            </h3>
          </div>
          <div className="space-y-2 text-red-700 dark:text-red-300">
            <p>
              <strong>Error Type:</strong> {errorDetails.type}
            </p>
            <p>
              <strong>Message:</strong> {errorDetails.message}
            </p>
            <p>
              <strong>Phase:</strong> {errorDetails.details.phase}
            </p>
            <p>
              <strong>Response:</strong> {errorDetails.details.response}
            </p>
            <p>
              <strong>Timestamp:</strong> {errorDetails.details.timestamp}
            </p>
            {errorDetails.details.eventId && (
              <p>
                <strong>Event ID:</strong> {errorDetails.details.eventId}
              </p>
            )}
          </div>
        </div>

        {errorDetails.allEvents && errorDetails.allEvents.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
            <h4 className="mb-2 font-semibold text-gray-800 dark:text-gray-200">
              All Related Events
            </h4>
            <div className="space-y-2">
              {errorDetails.allEvents.map((event, index) => (
                <div
                  key={index}
                  className="text-sm text-gray-600 dark:text-gray-400">
                  <p>
                    <strong>{event.reason}</strong> - {event.message}
                  </p>
                  <p className="text-xs">
                    Type: {event.type} | Count: {event.count}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Default fallback
  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500">
            <span className="text-xs font-bold text-white">!</span>
          </div>
          <h3 className="font-semibold text-red-800 dark:text-red-200">
            Error Details
          </h3>
        </div>
        <div className="space-y-2 text-red-700 dark:text-red-300">
          <p>
            <strong>Error Type:</strong> {errorDetails.type}
          </p>
          <p>
            <strong>Message:</strong> {errorDetails.message}
          </p>
          <p>
            <strong>Phase:</strong> {errorDetails.details.phase}
          </p>
          <p>
            <strong>Response:</strong> {errorDetails.details.response}
          </p>
          <p>
            <strong>Timestamp:</strong> {errorDetails.details.timestamp}
          </p>
          {errorDetails.details.eventId && (
            <p>
              <strong>Event ID:</strong> {errorDetails.details.eventId}
            </p>
          )}
        </div>
      </div>

      {errorDetails.allEvents && errorDetails.allEvents.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
          <h4 className="mb-2 font-semibold text-gray-800 dark:text-gray-200">
            All Related Events
          </h4>
          <div className="space-y-2">
            {errorDetails.allEvents.map((event, index) => (
              <div
                key={index}
                className="text-sm text-gray-600 dark:text-gray-400">
                <p>
                  <strong>{event.reason}</strong> - {event.message}
                </p>
                <p className="text-xs">
                  Type: {event.type} | Count: {event.count}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
