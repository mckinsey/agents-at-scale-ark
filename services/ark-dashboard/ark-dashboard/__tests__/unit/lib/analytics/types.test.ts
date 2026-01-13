import { describe, expect, it } from 'vitest';

import type {
  AnalyticsAdapter,
  AnalyticsConfig,
  ErrorEvent,
  PageViewEvent,
  TrackingEvent,
  UserIdentity,
} from '@/lib/analytics/types';

describe('Analytics Types', () => {
  describe('UserIdentity', () => {
    it('should allow valid user identity object', () => {
      const user: UserIdentity = {
        userId: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
        namespace: 'default',
      };

      expect(user.namespace).toBe('default');
    });

    it('should allow null values for optional fields', () => {
      const user: UserIdentity = {
        userId: undefined,
        name: null,
        email: null,
        namespace: 'production',
      };

      expect(user.namespace).toBe('production');
    });
  });

  describe('TrackingEvent', () => {
    it('should allow event with name only', () => {
      const event: TrackingEvent = {
        name: 'button_clicked',
      };

      expect(event.name).toBe('button_clicked');
    });

    it('should allow event with all properties', () => {
      const event: TrackingEvent = {
        name: 'agent_created',
        properties: { agentName: 'test-agent', toolCount: 5 },
        timestamp: new Date(),
      };

      expect(event.properties?.agentName).toBe('test-agent');
    });
  });

  describe('PageViewEvent', () => {
    it('should require path', () => {
      const pageView: PageViewEvent = {
        path: '/agents',
      };

      expect(pageView.path).toBe('/agents');
    });

    it('should allow optional title and referrer', () => {
      const pageView: PageViewEvent = {
        path: '/models',
        title: 'Models Page',
        referrer: '/agents',
      };

      expect(pageView.title).toBe('Models Page');
    });
  });

  describe('ErrorEvent', () => {
    it('should require message', () => {
      const error: ErrorEvent = {
        message: 'Something went wrong',
      };

      expect(error.message).toBe('Something went wrong');
    });

    it('should allow all error properties', () => {
      const error: ErrorEvent = {
        message: 'API Error',
        stack: 'Error: API Error\n    at ...',
        context: { endpoint: '/api/agents', status: 500 },
        severity: 'error',
      };

      expect(error.severity).toBe('error');
    });
  });

  describe('AnalyticsConfig', () => {
    it('should allow dynatrace provider', () => {
      const config: AnalyticsConfig = {
        provider: 'dynatrace',
        dynatraceRumUrl: 'https://example.dynatrace.com/rum.js',
        debug: false,
      };

      expect(config.provider).toBe('dynatrace');
    });

    it('should allow noop provider', () => {
      const config: AnalyticsConfig = {
        provider: 'noop',
        debug: true,
      };

      expect(config.provider).toBe('noop');
    });
  });

  describe('AnalyticsAdapter interface', () => {
    it('should be implementable', () => {
      const mockAdapter: AnalyticsAdapter = {
        init: () => {},
        setUser: () => {},
        trackEvent: () => {},
        trackPageView: () => {},
        trackError: () => {},
        flush: async () => {},
      };

      expect(mockAdapter.init).toBeDefined();
      expect(mockAdapter.setUser).toBeDefined();
      expect(mockAdapter.trackEvent).toBeDefined();
      expect(mockAdapter.trackPageView).toBeDefined();
      expect(mockAdapter.trackError).toBeDefined();
      expect(mockAdapter.flush).toBeDefined();
    });

    it('should allow optional getTraceContext', () => {
      const mockAdapter: AnalyticsAdapter = {
        init: () => {},
        setUser: () => {},
        trackEvent: () => {},
        trackPageView: () => {},
        trackError: () => {},
        flush: async () => {},
        getTraceContext: () => ({ traceId: '123', spanId: '456' }),
      };

      const context = mockAdapter.getTraceContext?.();
      expect(context?.traceId).toBe('123');
    });
  });
});

