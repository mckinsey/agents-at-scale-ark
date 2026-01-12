'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useNamespace } from '@/providers/NamespaceProvider';
import { useUser } from '@/providers/UserProvider';

import { setAnalyticsInstance } from './singleton';
import type {
  AnalyticsAdapter,
  ErrorEvent,
  PageViewEvent,
  TrackingEvent,
} from './types';

interface AnalyticsContextValue {
  trackEvent: (event: TrackingEvent) => void;
  trackPageView: (page: PageViewEvent) => void;
  trackError: (error: ErrorEvent) => void;
  getTraceContext: () => { traceId?: string; spanId?: string } | null;
}

const AnalyticsContext = createContext<AnalyticsContextValue | null>(null);

async function createAdapter(): Promise<AnalyticsAdapter> {
  const provider = process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER || 'noop';

  if (provider === 'dynatrace') {
    const { DynatraceAdapter } = await import('./adapters/dynatrace');
    return new DynatraceAdapter();
  }

  const { NoopAdapter } = await import('./adapters/noop');
  return new NoopAdapter();
}

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const { namespace } = useNamespace();
  const [adapter, setAdapter] = useState<AnalyticsAdapter | null>(null);

  useEffect(() => {
    let mounted = true;

    createAdapter().then(instance => {
      if (!mounted) return;

      instance.init({
        provider:
          (process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER as
            | 'dynatrace'
            | 'noop') || 'noop',
        dynatraceRumUrl: process.env.NEXT_PUBLIC_DYNATRACE_RUM_URL,
        debug: process.env.NODE_ENV === 'development',
      });

      setAnalyticsInstance(instance);
      setAdapter(instance);
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!adapter) return;

    adapter.setUser({
      userId: user?.id,
      name: user?.name,
      email: user?.email,
      namespace: namespace,
    });
  }, [adapter, user, namespace]);

  useEffect(() => {
    if (!adapter) return;

    const handleBeforeUnload = () => {
      adapter.flush();
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      adapter.trackError({
        message: event.reason?.message || 'Unhandled promise rejection',
        stack: event.reason?.stack,
        severity: 'error',
        context: {
          type: 'unhandledRejection',
        },
      });
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
      window.removeEventListener(
        'unhandledrejection',
        handleUnhandledRejection,
      );
    };
  }, [adapter]);

  const trackEvent = useCallback(
    (event: TrackingEvent) => {
      adapter?.trackEvent(event);
    },
    [adapter],
  );

  const trackPageView = useCallback(
    (page: PageViewEvent) => {
      adapter?.trackPageView(page);
    },
    [adapter],
  );

  const trackError = useCallback(
    (error: ErrorEvent) => {
      adapter?.trackError(error);
    },
    [adapter],
  );

  const getTraceContext = useCallback(() => {
    return adapter?.getTraceContext?.() ?? null;
  }, [adapter]);

  const contextValue = useMemo(
    () => ({
      trackEvent,
      trackPageView,
      trackError,
      getTraceContext,
    }),
    [trackEvent, trackPageView, trackError, getTraceContext],
  );

  return (
    <AnalyticsContext.Provider value={contextValue}>
      {children}
    </AnalyticsContext.Provider>
  );
}

export function useAnalyticsContext() {
  const context = useContext(AnalyticsContext);
  if (!context) {
    throw new Error(
      'useAnalyticsContext must be used within an AnalyticsProvider',
    );
  }
  return context;
}
