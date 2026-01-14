export type {
  AnalyticsAdapter,
  AnalyticsConfig,
  ErrorEvent,
  PageViewEvent,
  TrackingEvent,
  UserIdentity,
} from './types';

export { AnalyticsProvider, useAnalyticsContext } from './provider';

export {
  createTrackingHandler,
  useAnalytics,
  useTrackClick,
  useTrackError,
  useTrackEvent,
  useTrackPageView,
} from './hooks';

export {
  getAnalyticsInstance,
  setAnalyticsInstance,
  trackError,
  trackEvent,
} from './singleton';

export { hashPrompt, hashPromptSync } from './utils';

export { AnalyticsErrorBoundary } from './error-boundary';
