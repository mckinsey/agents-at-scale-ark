import type {
  AnalyticsAdapter,
  AnalyticsConfig,
  ErrorEvent,
  PageViewEvent,
  TrackingEvent,
  UserIdentity,
} from '../types';

export class NoopAdapter implements AnalyticsAdapter {
  private debug = false;
  private events: TrackingEvent[] = [];
  private errors: ErrorEvent[] = [];

  init(config: AnalyticsConfig): void {
    this.debug = config.debug ?? true;
    if (this.debug) {
      console.log('[Analytics:Noop] Initialized', config);
    }
  }

  setUser(user: UserIdentity): void {
    if (this.debug) {
      console.log('[Analytics:Noop] setUser', user);
    }
  }

  trackEvent(event: TrackingEvent): void {
    this.events.push(event);
    if (this.debug) {
      console.log('[Analytics:Noop] trackEvent', event);
    }
  }

  trackPageView(page: PageViewEvent): void {
    if (this.debug) {
      console.log('[Analytics:Noop] trackPageView', page);
    }
  }

  trackError(error: ErrorEvent): void {
    this.errors.push(error);
    if (this.debug) {
      console.log('[Analytics:Noop] trackError', error);
    }
  }

  async flush(): Promise<void> {
    if (this.debug) {
      console.log('[Analytics:Noop] flush', {
        eventCount: this.events.length,
        errorCount: this.errors.length,
      });
    }
  }

  getTraceContext(): { traceId?: string; spanId?: string } | null {
    return { traceId: 'noop-trace-id', spanId: 'noop-span-id' };
  }

  getRecentEvents(): TrackingEvent[] {
    return [...this.events];
  }

  getRecentErrors(): ErrorEvent[] {
    return [...this.errors];
  }

  clearEvents(): void {
    this.events = [];
    this.errors = [];
  }
}
