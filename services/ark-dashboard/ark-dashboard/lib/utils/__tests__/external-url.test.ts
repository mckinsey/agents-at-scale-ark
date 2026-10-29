import { describe, expect, it, vi } from 'vitest';

import { isSafeExternalUrl, openExternalUrl } from '../external-url';

describe('isSafeExternalUrl', () => {
  it('accepts http and https', () => {
    expect(isSafeExternalUrl('http://example.com')).toBe(true);
    expect(isSafeExternalUrl('https://example.com/path?q=1')).toBe(true);
  });

  it('rejects script-bearing and non-navigational schemes', () => {
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalUrl('JavaScript:alert(1)')).toBe(false);
    expect(isSafeExternalUrl('data:text/html,<script>alert(1)</script>')).toBe(
      false,
    );
    expect(isSafeExternalUrl('vbscript:msgbox(1)')).toBe(false);
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false);
  });

  it('rejects empty, relative and malformed values', () => {
    expect(isSafeExternalUrl(undefined)).toBe(false);
    expect(isSafeExternalUrl(null)).toBe(false);
    expect(isSafeExternalUrl('')).toBe(false);
    expect(isSafeExternalUrl('/relative/path')).toBe(false);
    expect(isSafeExternalUrl('not a url')).toBe(false);
  });
});

describe('openExternalUrl', () => {
  it('opens a safe url with noopener and noreferrer', () => {
    const spy = vi.spyOn(window, 'open').mockImplementation(() => null);

    openExternalUrl('https://example.com');

    expect(spy).toHaveBeenCalledWith(
      'https://example.com',
      '_blank',
      'noopener,noreferrer',
    );
    spy.mockRestore();
  });

  it('does not open an unsafe url', () => {
    const spy = vi.spyOn(window, 'open').mockImplementation(() => null);

    openExternalUrl('javascript:alert(1)');

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
