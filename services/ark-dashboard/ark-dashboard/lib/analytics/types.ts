export interface UserIdentity {
  userId?: string;
  name?: string | null;
  email?: string | null;
  namespace: string;
}

export interface TrackingEvent {
  name: string;
  properties?: Record<string, unknown>;
  timestamp?: Date;
}

export interface PageViewEvent {
  path: string;
  title?: string;
  referrer?: string;
}

export interface ErrorEvent {
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  severity?: 'error' | 'warning' | 'info';
}

export interface AnalyticsConfig {
  provider: 'dynatrace' | 'noop';
  dynatraceRumUrl?: string;
  debug?: boolean;
}

export interface AnalyticsAdapter {
  init(config: AnalyticsConfig): void;
  setUser(user: UserIdentity): void;
  trackEvent(event: TrackingEvent): void;
  trackPageView(page: PageViewEvent): void;
  trackError(error: ErrorEvent): void;
  flush(): Promise<void>;
  getTraceContext?(): { traceId?: string; spanId?: string } | null;
}
