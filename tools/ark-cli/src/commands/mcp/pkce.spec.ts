import {Buffer} from 'buffer';
import {createHash} from 'crypto';
import {describe, it, expect} from 'vitest';
import {generatePkcePair, generateState} from './pkce.js';

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

describe('pkce', () => {
  it('produces S256 challenge that matches sha256(verifier) base64url-encoded', () => {
    const pair = generatePkcePair();

    expect(pair.method).toBe('S256');
    expect(pair.verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(pair.challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(pair.verifier.includes('=')).toBe(false);
    expect(pair.challenge.includes('=')).toBe(false);

    const expected = base64UrlEncode(
      createHash('sha256').update(pair.verifier).digest()
    );
    expect(pair.challenge).toBe(expected);
  });

  it('verifier length falls in RFC 7636 43..128 range', () => {
    const {verifier} = generatePkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
  });

  it('generates distinct pairs', () => {
    const a = generatePkcePair();
    const b = generatePkcePair();
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.challenge).not.toBe(b.challenge);
  });

  it('state is hex and long enough to resist guessing', () => {
    const s = generateState();
    expect(s).toMatch(/^[0-9a-f]+$/);
    expect(s.length).toBeGreaterThanOrEqual(12);
  });
});
