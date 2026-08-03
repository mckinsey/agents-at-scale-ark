import { describe, it, expect } from 'vitest';
import {
  buildUrlWithoutNewSessionParams,
  hasNewSessionParams,
} from './session-params';

describe('hasNewSessionParams', () => {
  it('returns true when any new-session param is present', () => {
    expect(hasNewSessionParams(new URLSearchParams('participant=a'))).toBe(true);
    expect(hasNewSessionParams(new URLSearchParams('type=agent'))).toBe(true);
    expect(hasNewSessionParams(new URLSearchParams('conversationId=c1'))).toBe(
      true,
    );
  });

  it('returns false when none are present', () => {
    expect(hasNewSessionParams(new URLSearchParams('namespace=demo'))).toBe(
      false,
    );
    expect(hasNewSessionParams(new URLSearchParams())).toBe(false);
    expect(hasNewSessionParams(null)).toBe(false);
  });
});

describe('buildUrlWithoutNewSessionParams', () => {
  it('removes the new-session params while keeping the rest', () => {
    const params = new URLSearchParams(
      'participant=agent-1&type=agent&conversationId=c-1&namespace=demo',
    );

    expect(buildUrlWithoutNewSessionParams(params, '/sessions')).toBe(
      '/sessions?namespace=demo',
    );
  });

  it('returns a bare path when only new-session params were present', () => {
    const params = new URLSearchParams(
      'participant=agent-1&type=agent&conversationId=c-1',
    );

    expect(buildUrlWithoutNewSessionParams(params, '/sessions')).toBe(
      '/sessions',
    );
  });

  it('returns a bare path when there are no params', () => {
    expect(buildUrlWithoutNewSessionParams(null, '/sessions')).toBe(
      '/sessions',
    );
  });
});
