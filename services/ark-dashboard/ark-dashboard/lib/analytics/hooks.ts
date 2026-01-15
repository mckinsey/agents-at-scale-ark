'use client';

import { usePathname } from 'next/navigation';
import { useCallback } from 'react';
import { useEffect } from 'react';

import { useAnalyticsContext } from './provider';
import type { TrackingEvent } from './types';

export function useAnalytics() {
  return useAnalyticsContext();
}

export function useTrackClick(
  eventName: string,
  properties?: Record<string, unknown>,
) {
  const { trackEvent } = useAnalyticsContext();

  return useCallback(() => {
    trackEvent({
      name: eventName,
      properties,
      timestamp: new Date(),
    });
  }, [trackEvent, eventName, properties]);
}

export function useTrackEvent() {
  const { trackEvent } = useAnalyticsContext();

  return useCallback(
    (name: string, properties?: Record<string, unknown>) => {
      trackEvent({
        name,
        properties,
        timestamp: new Date(),
      });
    },
    [trackEvent],
  );
}

export function useTrackPageView(title?: string) {
  const { trackPageView } = useAnalyticsContext();
  const pathname = usePathname();

  useEffect(() => {
    trackPageView({
      path: pathname,
      title: title || document.title,
      referrer: document.referrer,
    });
  }, [pathname, title, trackPageView]);
}

export function useTrackError() {
  const { trackError } = useAnalyticsContext();

  return useCallback(
    (
      message: string,
      options?: {
        stack?: string;
        context?: Record<string, unknown>;
        severity?: 'error' | 'warning' | 'info';
      },
    ) => {
      trackError({
        message,
        stack: options?.stack,
        context: options?.context,
        severity: options?.severity || 'error',
      });
    },
    [trackError],
  );
}

export function createTrackingHandler<T extends (...args: unknown[]) => void>(
  event: TrackingEvent,
  handler: T,
  trackEvent: (event: TrackingEvent) => void,
): T {
  return ((...args: unknown[]) => {
    trackEvent(event);
    return handler(...args);
  }) as T;
}
