import { describe, expect, it } from 'vitest';

import { readStoredMcpCredentials } from '@/atoms/chat-mcp-credentials';

const credential = {
  id: 'c1',
  server: 'github',
  header: 'Authorization',
  secret: 'github-token',
  key: 'token',
};

describe('readStoredMcpCredentials', () => {
  it('returns the rows of the requested namespace only', () => {
    const stored = {
      'team-a': [credential],
      'team-b': [{ ...credential, id: 'c2', secret: 'other' }],
    };

    expect(readStoredMcpCredentials(stored, 'team-a')).toEqual([credential]);
    expect(readStoredMcpCredentials(stored, 'team-c')).toEqual([]);
  });

  it.each([
    ['null', null],
    ['a string', 'oops'],
    ['an array', [credential]],
  ])('returns no rows when the stored value is %s', (_label, stored) => {
    expect(readStoredMcpCredentials(stored, 'team-a')).toEqual([]);
  });

  it('returns no rows when the namespace entry is not a list', () => {
    expect(
      readStoredMcpCredentials({ 'team-a': credential }, 'team-a'),
    ).toEqual([]);
  });

  it('drops malformed rows', () => {
    const stored = {
      'team-a': [credential, { ...credential, key: 1 }, null, 'row'],
    };

    expect(readStoredMcpCredentials(stored, 'team-a')).toEqual([credential]);
  });

  it('keeps only the known fields of a row', () => {
    const stored = {
      'team-a': [{ ...credential, value: 'leaked', valueFrom: {} }],
    };

    expect(readStoredMcpCredentials(stored, 'team-a')).toEqual([credential]);
  });

  it('does not read inherited keys as a namespace', () => {
    expect(readStoredMcpCredentials({}, 'constructor')).toEqual([]);
  });
});
