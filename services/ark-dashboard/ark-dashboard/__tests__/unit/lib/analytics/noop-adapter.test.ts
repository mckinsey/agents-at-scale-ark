import { describe, expect, it, vi, beforeEach } from 'vitest';

import { NoopAdapter } from '@/lib/analytics/adapters/noop';

describe('NoopAdapter', () => {
  let adapter: NoopAdapter;

  beforeEach(() => {
    adapter = new NoopAdapter();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('init', () => {
    it('should initialize with config', () => {
      adapter.init({ provider: 'noop', debug: true });
      expect(console.log).toHaveBeenCalledWith(
        '[Analytics:Noop] Initialized',
        expect.objectContaining({ provider: 'noop' }),
      );
    });
  });

  describe('setUser', () => {
    it('should log user identity', () => {
      adapter.init({ provider: 'noop', debug: true });
      adapter.setUser({
        userId: 'user-123',
        name: 'Test User',
        email: 'test@example.com',
        namespace: 'default',
      });
      expect(console.log).toHaveBeenCalledWith(
        '[Analytics:Noop] setUser',
        expect.objectContaining({ userId: 'user-123' }),
      );
    });
  });

  describe('trackEvent', () => {
    it('should store and log events', () => {
      adapter.init({ provider: 'noop', debug: true });
      adapter.trackEvent({ name: 'test_event', properties: { key: 'value' } });

      expect(console.log).toHaveBeenCalledWith(
        '[Analytics:Noop] trackEvent',
        expect.objectContaining({ name: 'test_event' }),
      );

      const events = adapter.getRecentEvents();
      expect(events).toHaveLength(1);
      expect(events[0].name).toBe('test_event');
    });

    it('should accumulate multiple events', () => {
      adapter.init({ provider: 'noop', debug: false });
      adapter.trackEvent({ name: 'event_1' });
      adapter.trackEvent({ name: 'event_2' });
      adapter.trackEvent({ name: 'event_3' });

      const events = adapter.getRecentEvents();
      expect(events).toHaveLength(3);
    });
  });

  describe('trackError', () => {
    it('should store and log errors', () => {
      adapter.init({ provider: 'noop', debug: true });
      adapter.trackError({ message: 'Test error', severity: 'error' });

      expect(console.log).toHaveBeenCalledWith(
        '[Analytics:Noop] trackError',
        expect.objectContaining({ message: 'Test error' }),
      );

      const errors = adapter.getRecentErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe('Test error');
    });
  });

  describe('trackPageView', () => {
    it('should log page views', () => {
      adapter.init({ provider: 'noop', debug: true });
      adapter.trackPageView({ path: '/agents', title: 'Agents' });

      expect(console.log).toHaveBeenCalledWith(
        '[Analytics:Noop] trackPageView',
        expect.objectContaining({ path: '/agents' }),
      );
    });
  });

  describe('flush', () => {
    it('should log flush with counts', async () => {
      adapter.init({ provider: 'noop', debug: true });
      adapter.trackEvent({ name: 'event_1' });
      adapter.trackError({ message: 'error_1' });

      await adapter.flush();

      expect(console.log).toHaveBeenCalledWith(
        '[Analytics:Noop] flush',
        expect.objectContaining({ eventCount: 1, errorCount: 1 }),
      );
    });
  });

  describe('clearEvents', () => {
    it('should clear all stored events and errors', () => {
      adapter.init({ provider: 'noop', debug: false });
      adapter.trackEvent({ name: 'event_1' });
      adapter.trackError({ message: 'error_1' });

      expect(adapter.getRecentEvents()).toHaveLength(1);
      expect(adapter.getRecentErrors()).toHaveLength(1);

      adapter.clearEvents();

      expect(adapter.getRecentEvents()).toHaveLength(0);
      expect(adapter.getRecentErrors()).toHaveLength(0);
    });
  });

  describe('getTraceContext', () => {
    it('should return noop trace context', () => {
      const context = adapter.getTraceContext();
      expect(context).toEqual({
        traceId: 'noop-trace-id',
        spanId: 'noop-span-id',
      });
    });
  });
});

