import {Buffer} from 'buffer';
import {createHash, randomBytes} from 'crypto';

export interface PkcePair {
  verifier: string;
  challenge: string;
  method: 'S256';
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function generatePkcePair(): PkcePair {
  // 32 bytes -> 43 char base64url verifier, comfortably inside RFC 7636's 43-128 range.
  const verifier = base64UrlEncode(randomBytes(32));
  const challenge = base64UrlEncode(
    createHash('sha256').update(verifier).digest()
  );
  return {verifier, challenge, method: 'S256'};
}

export function generateState(): string {
  return randomBytes(6).toString('hex');
}
