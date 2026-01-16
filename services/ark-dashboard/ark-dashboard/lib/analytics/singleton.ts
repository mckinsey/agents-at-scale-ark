import type { AnalyticsAdapter, ErrorEvent, TrackingEvent } from './types';

let analyticsInstance: AnalyticsAdapter | null = null;

export function setAnalyticsInstance(instance: AnalyticsAdapter): void {
  analyticsInstance = instance;
}

export function getAnalyticsInstance(): AnalyticsAdapter | null {
  return analyticsInstance;
}

export function trackEvent(event: TrackingEvent): void {
  analyticsInstance?.trackEvent(event);
}

export function trackError(error: ErrorEvent): void {
  analyticsInstance?.trackError(error);
}
