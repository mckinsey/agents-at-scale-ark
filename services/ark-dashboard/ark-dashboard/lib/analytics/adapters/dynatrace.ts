import type {
  AnalyticsAdapter,
  AnalyticsConfig,
  ErrorEvent,
  PageViewEvent,
  TrackingEvent,
  UserIdentity,
} from '../types';

interface DtrumApi {
  identifyUser(userId: string): void;
  sendSessionProperties(
    integers?: Record<string, number>,
    floats?: Record<string, number>,
    strings?: Record<string, string>,
  ): void;
  enterAction(name: string, type?: string, startTime?: number): number;
  leaveAction(actionId: number, stopTime?: number): void;
  reportError(error: Error | { message: string; stack?: string }): void;
  getSessionId(): string | null;
}

type WindowWithDtrum = typeof globalThis & { dtrum?: DtrumApi };

export class DynatraceAdapter implements AnalyticsAdapter {
  dtrum: DtrumApi | null = null;
  isDebug = false;
  pendingUser: UserIdentity | null = null;

  init(config: AnalyticsConfig): void {
    this.isDebug = config.debug ?? false;

    if (typeof window !== 'undefined') {
      this.dtrum = (window as WindowWithDtrum).dtrum ?? null;

      if (this.dtrum && this.pendingUser) {
        this.setUser(this.pendingUser);
        this.pendingUser = null;
      }

      if (this.isDebug) {
        console.log('[Dynatrace] Adapter initialized', {
          available: !!this.dtrum,
        });
      }
    }
  }

  setUser(user: UserIdentity): void {
    if (!this.dtrum) {
      this.pendingUser = user;
      return;
    }

    const userIdentifier =
      user.name || user.email || user.userId || 'anonymous';
    this.dtrum.identifyUser(userIdentifier);

    this.dtrum.sendSessionProperties(undefined, undefined, {
      'ark.namespace': user.namespace,
      'ark.userId': user.userId || '',
      'ark.userName': user.name || '',
      'ark.userEmail': user.email || '',
    });

    if (this.isDebug) {
      console.log('[Dynatrace] User identified', { userIdentifier, user });
    }
  }

  trackEvent(event: TrackingEvent): void {
    if (!this.dtrum) {
      if (this.isDebug) {
        console.log('[Dynatrace] Event queued (dtrum not ready)', event);
      }
      return;
    }

    const actionId = this.dtrum.enterAction(event.name, 'custom');

    if (event.properties) {
      const stringProps: Record<string, string> = {};
      Object.entries(event.properties).forEach(([key, value]) => {
        stringProps[`ark.${event.name}.${key}`] = String(value);
      });
      this.dtrum.sendSessionProperties(undefined, undefined, stringProps);
    }

    this.dtrum.leaveAction(actionId);

    if (this.isDebug) {
      console.log('[Dynatrace] Event tracked', event);
    }
  }

  trackPageView(page: PageViewEvent): void {
    if (!this.dtrum) {
      return;
    }

    this.dtrum.sendSessionProperties(undefined, undefined, {
      'ark.currentPage': page.path,
      'ark.pageTitle': page.title || '',
    });

    if (this.isDebug) {
      console.log('[Dynatrace] Page view tracked', page);
    }
  }

  trackError(error: ErrorEvent): void {
    if (!this.dtrum) {
      if (this.isDebug) {
        console.log('[Dynatrace] Error queued (dtrum not ready)', error);
      }
      return;
    }

    this.dtrum.reportError({
      message: error.message,
      stack: error.stack,
    });

    if (error.context) {
      const contextStrings: Record<string, string> = {};
      Object.entries(error.context).forEach(([key, value]) => {
        contextStrings[`ark.error.${key}`] = String(value);
      });
      this.dtrum.sendSessionProperties(undefined, undefined, contextStrings);
    }

    if (this.isDebug) {
      console.log('[Dynatrace] Error tracked', error);
    }
  }

  async flush(): Promise<void> {
    if (this.isDebug) {
      console.log(
        '[Dynatrace] Flush called (Dynatrace handles this internally)',
      );
    }
  }

  getTraceContext(): { traceId?: string; spanId?: string } | null {
    if (!this.dtrum) {
      return null;
    }

    const sessionId = this.dtrum.getSessionId();
    return sessionId ? { traceId: sessionId } : null;
  }
}
