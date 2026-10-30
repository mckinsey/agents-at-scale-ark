import { act, renderHook } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CHAT_MCP_CREDENTIALS_KEY,
  type StoredMcpCredential,
} from '@/atoms/chat-mcp-credentials';
import {
  buildMcpCredentialOverrides,
  evaluateMcpCredentials,
  getMcpServerTargetIssue,
  isValidMcpCredentialField,
  looksLikeToken,
  mcpCredentialStorageKey,
  readyMcpCredentials,
  useChatMcpCredentials,
} from '@/lib/hooks/use-chat-mcp-credentials';
import { useGetAllMcpServers } from '@/lib/services/mcp-servers-hooks';
import { useGetAllSecrets } from '@/lib/services/secrets-hooks';
import { useUser } from '@/providers/UserProvider';

const NAME_LABEL = 'ark.mckinsey.com/name';

let currentNamespace = 'team-a';

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({
    namespace: currentNamespace,
    isNamespaceResolved: true,
    isPending: false,
    readOnlyMode: false,
  }),
}));

vi.mock('@/providers/UserProvider', () => ({
  useUser: vi.fn(),
}));

vi.mock('@/lib/services/mcp-servers-hooks', () => ({
  useGetAllMcpServers: vi.fn(),
}));

vi.mock('@/lib/services/secrets-hooks', () => ({
  useGetAllSecrets: vi.fn(),
}));

function server(name: string, labels?: Record<string, string> | null) {
  return { id: name, name, namespace: 'team-a', labels };
}

const labelled = (name: string) => server(name, { [NAME_LABEL]: name });

function credential(
  overrides: Partial<StoredMcpCredential> = {},
): StoredMcpCredential {
  return {
    id: 'c1',
    server: 'github',
    header: 'Authorization',
    secret: 'github-token',
    key: 'token',
    ...overrides,
  };
}

const SERVERS = [labelled('github'), server('jira', null)];
const LOADED = { servers: SERVERS, isPending: false };

function issues(
  credentials: StoredMcpCredential[],
  state: Parameters<typeof evaluateMcpCredentials>[1] = LOADED,
) {
  return evaluateMcpCredentials(credentials, state).map(row => row.issue);
}

describe('getMcpServerTargetIssue', () => {
  it('accepts a server whose name label matches its name', () => {
    expect(getMcpServerTargetIssue(labelled('github'))).toBeNull();
  });

  it.each([
    ['no labels', null],
    ['other labels only', { team: 'a' }],
    ['a name label for another server', { [NAME_LABEL]: 'gitlab' }],
  ])('flags a server with %s as unlabelled', (_label, labels) => {
    expect(getMcpServerTargetIssue(server('github', labels))).toBe(
      'unlabelled',
    );
  });

  it('accepts a 63 character name', () => {
    const name = 'a'.repeat(63);
    expect(getMcpServerTargetIssue(labelled(name))).toBeNull();
  });

  it('flags names that cannot be a label value', () => {
    const name = 'a'.repeat(64);
    expect(getMcpServerTargetIssue(labelled(name))).toBe('name-too-long');
  });

  it('flags a server whose name label another server also carries', () => {
    const proxy = server('github-proxy', { [NAME_LABEL]: 'github' });
    expect(
      getMcpServerTargetIssue(labelled('github'), [labelled('github'), proxy]),
    ).toBe('ambiguous');
  });
});

describe('isValidMcpCredentialField', () => {
  it.each([
    ['header', 'Authorization'],
    ['header', 'X-Api-Key'],
    ['secret', 'u-0123456789abcdef-github'],
    ['secret', 'team.github-token'],
    ['key', 'api_key.v2'],
    ['key', 'token'],
    ['key', 'task-id'],
    ['key', 'AbCdEfGhIjKlMnOpQrStUvW'],
    ['key', 'SERVICE_ACCOUNT_TOKEN_KEY_V2_PROD_01'],
    ['key', 'service-account-token-key-v2-prod-01'],
    ['header', 'X-Personal-Token'],
    ['header', 'X-Very-Long-Custom-Authorization-Header'],
    ['secret', 'sk-team-token'],
    ['secret', 'u-0123456789abcdef-a-much-longer-personal-name'],
    ['secret', ''],
  ] as const)('accepts %s %j', (field, value) => {
    expect(isValidMcpCredentialField(field, value)).toBe(true);
  });

  it.each([
    ['header', 'Bearer abc'],
    ['secret', 'Not_A_Name'],
    ['secret', 'Bearer abc'],
    ['secret', 'a'.repeat(254)],
    ['key', 'my key'],
    ['key', 'ghp_AbC123'],
    ['key', 'gho_AbC123'],
    ['key', 'ghs_AbC123'],
    ['key', 'glpat-x'],
    ['key', 'sk_live_AbC'],
    ['key', 'dop_v1_abc'],
    ['key', 'AIzaAbC'],
    ['key', 'AbCdEfGhIjKlMnOpQrStUvWx'],
    ['key', '00000000-0000-0000-0000-000000000000'],
    ['header', 'ASIAIOSFODNN7EXAMPLE'],
    ['secret', '00000000-0000-0000-0000-000000000000'],
    ['secret', 'abcdef0123'.repeat(3)],
    ['key', 'github_pat_11ABCDEF'],
    ['key', 'xoxb-123-abc'],
    ['key', 'eyJabc'],
    ['key', 'AbCdEfGhIjKlMnOpQrStUvWxYz123456'],
    ['header', 'sk-proj-abc'],
    ['header', 'AKIAIOSFODNN7EXAMPLE'],
  ] as const)('rejects %s %j', (field, value) => {
    expect(isValidMcpCredentialField(field, value)).toBe(false);
  });
});

describe('evaluateMcpCredentials', () => {
  it('marks a complete credential for a labelled server as ready', () => {
    expect(issues([credential()])).toEqual([null]);
  });

  it('flags a credential for a server without the name label', () => {
    expect(issues([credential({ server: 'jira' })])).toEqual(['unlabelled']);
  });

  it('flags a credential for a server that no longer exists', () => {
    expect(issues([credential({ server: 'deleted' })])).toEqual([
      'server-missing',
    ]);
  });

  it('flags a credential whose server shares its name label', () => {
    const servers = [
      labelled('github'),
      server('github-proxy', { [NAME_LABEL]: 'github' }),
    ];
    expect(issues([credential()], { servers, isPending: false })).toEqual([
      'ambiguous',
    ]);
  });

  it('waits while the server list loads', () => {
    expect(
      issues([credential()], { servers: undefined, isPending: true }),
    ).toEqual(['servers-pending']);
  });

  it('flags a chosen server when the server list failed to load', () => {
    expect(
      issues([credential()], { servers: undefined, isPending: false }),
    ).toEqual(['servers-unavailable']);
  });

  it.each([
    ['server', { server: '' }],
    ['header', { header: '  ' }],
    ['secret', { secret: ' ' }],
    ['key', { key: '' }],
  ])('flags a credential without a %s as incomplete', (_label, change) => {
    expect(issues([credential(change)])).toEqual(['incomplete']);
  });

  it('ignores a row with neither server nor secret', () => {
    expect(issues([credential({ server: '', secret: '  ' })])).toEqual([null]);
  });

  it('flags a second credential for the same server and header', () => {
    expect(
      issues([
        credential(),
        credential({ id: 'c2', header: ' authorization ' }),
      ]),
    ).toEqual([null, 'duplicate']);
  });

  it('accepts two headers for the same server', () => {
    expect(
      issues([credential(), credential({ id: 'c2', header: 'X-Api-Key' })]),
    ).toEqual([null, null]);
  });

  it('overlays an invalid draft and flags it', () => {
    const [row] = evaluateMcpCredentials([credential()], LOADED, {
      c1: { secret: 'Pasted_Value' },
    });
    expect(row).toMatchObject({
      secret: 'Pasted_Value',
      issue: 'invalid',
      invalidFields: ['secret'],
    });
  });
});

describe('looksLikeToken', () => {
  it('ignores surrounding spaces', () => {
    expect(looksLikeToken('  ghp_AbC123 ')).toBe(true);
  });

  it('flags a long run of hex digits', () => {
    expect(looksLikeToken('0123456789abcdef'.repeat(2))).toBe(true);
  });
});

describe('evaluateMcpCredentials with the listed secrets', () => {
  const LISTED = new Set(['github-token']);

  it('locks the key to token for a secret from the list', () => {
    const [row] = evaluateMcpCredentials(
      [credential({ key: 'pat' })],
      LOADED,
      {},
      LISTED,
    );
    expect(row).toMatchObject({ key: 'token', keyLocked: true, issue: null });
  });

  it('locks the key for a listed secret typed with surrounding spaces', () => {
    const [row] = evaluateMcpCredentials(
      [credential({ secret: 'github-token ', key: 'pat' })],
      LOADED,
      {},
      LISTED,
    );
    expect(row).toMatchObject({ key: 'token', keyLocked: true });
  });

  it('waits for the secret list before sending a key other than token', () => {
    const rows = evaluateMcpCredentials(
      [
        credential({ id: 'c1', key: 'pat' }),
        credential({ id: 'c2', header: 'X-Other' }),
      ],
      LOADED,
      {},
      new Set(),
      true,
    );
    expect(rows.map(row => row.issue)).toEqual(['secrets-pending', null]);
  });

  it('keeps a typed key for a secret outside the list', () => {
    const [row] = evaluateMcpCredentials(
      [credential({ secret: 'outside', key: 'pat' })],
      LOADED,
      {},
      LISTED,
    );
    expect(row).toMatchObject({ key: 'pat', keyLocked: false, issue: null });
  });

  it('never sends a token stored as the key of a listed secret', () => {
    const rows = evaluateMcpCredentials(
      [credential({ key: 'ghp_AbC123' })],
      LOADED,
      {},
      LISTED,
    );
    expect(rows[0].issue).toBeNull();
    expect(readyMcpCredentials(rows)[0].key).toBe('token');
  });

  it('flags a token typed as the key of a secret outside the list', () => {
    const [row] = evaluateMcpCredentials(
      [credential({ secret: 'outside', key: 'ghp_AbC123' })],
      LOADED,
      {},
      LISTED,
    );
    expect(row).toMatchObject({ issue: 'invalid', invalidFields: ['key'] });
  });
});

describe('readyMcpCredentials', () => {
  it('returns trimmed names of the rows without issues', () => {
    const rows = evaluateMcpCredentials(
      [
        credential({ header: ' X-Org ', secret: ' org ', key: ' id ' }),
        credential({ id: 'c2', server: 'jira' }),
        credential({ id: 'c3', header: 'x-org' }),
        credential({ id: 'c4', server: '', secret: '' }),
      ],
      LOADED,
    );

    expect(readyMcpCredentials(rows)).toEqual([
      {
        id: 'c1',
        server: 'github',
        header: 'X-Org',
        secret: 'org',
        key: 'id',
      },
    ]);
  });
});

describe('buildMcpCredentialOverrides', () => {
  it('returns no overrides for no credentials', () => {
    expect(buildMcpCredentialOverrides([])).toEqual([]);
  });

  it('targets each server by its name label and groups its headers', () => {
    const overrides = buildMcpCredentialOverrides([
      credential(),
      credential({
        id: 'c2',
        server: 'jira',
        secret: 'jira-token',
        key: 'pat',
      }),
      credential({ id: 'c3', header: 'X-Org', secret: 'org', key: 'id' }),
    ]);

    expect(overrides).toEqual([
      {
        resourceType: 'mcpserver',
        labelSelector: { matchLabels: { [NAME_LABEL]: 'github' } },
        headers: [
          {
            name: 'Authorization',
            value: {
              valueFrom: {
                secretKeyRef: { name: 'github-token', key: 'token' },
              },
            },
          },
          {
            name: 'X-Org',
            value: { valueFrom: { secretKeyRef: { name: 'org', key: 'id' } } },
          },
        ],
      },
      {
        resourceType: 'mcpserver',
        labelSelector: { matchLabels: { [NAME_LABEL]: 'jira' } },
        headers: [
          {
            name: 'Authorization',
            value: {
              valueFrom: { secretKeyRef: { name: 'jira-token', key: 'pat' } },
            },
          },
        ],
      },
    ]);
  });

  it('never sends a literal header value', () => {
    const [override] = buildMcpCredentialOverrides([credential()]);
    expect(override.headers[0].value).not.toHaveProperty('value');
  });
});

describe('mcpCredentialStorageKey', () => {
  it('keys by namespace without a user and by user and namespace with one', () => {
    expect(mcpCredentialStorageKey('team-a', null)).toBe('team-a');
    expect(mcpCredentialStorageKey('team-a', 'admin@ark.local')).toBe(
      'admin@ark.local/team-a',
    );
  });
});

describe('useChatMcpCredentials', () => {
  let store: ReturnType<typeof createStore>;
  const refetch = vi.fn();

  function wrapper({ children }: { children: ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  }

  function stored(): Record<string, StoredMcpCredential[]> {
    return JSON.parse(localStorage.getItem(CHAT_MCP_CREDENTIALS_KEY) ?? '{}');
  }

  function mockServers(
    data: ReturnType<typeof server>[] | undefined,
    isPending = false,
  ) {
    vi.mocked(useGetAllMcpServers).mockReturnValue({
      data,
      isPending,
      refetch,
    } as unknown as ReturnType<typeof useGetAllMcpServers>);
  }

  beforeEach(() => {
    localStorage.clear();
    store = createStore();
    currentNamespace = 'team-a';
    vi.mocked(useUser).mockReturnValue({ user: null });
    mockServers(SERVERS);
    vi.mocked(useGetAllSecrets).mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useGetAllSecrets>);
  });

  function render() {
    return renderHook(() => useChatMcpCredentials(), { wrapper });
  }

  function addGithubCredential(
    result: { current: ReturnType<typeof useChatMcpCredentials> },
    secret = 'u-0123456789abcdef-github',
  ) {
    let id = '';
    act(() => {
      id = result.current.addRow();
    });
    act(() => {
      result.current.updateRow(id, { server: 'github', secret });
    });
    act(() => {
      result.current.commitRow(id);
    });
    return id;
  }

  it('starts a new row with the default header and key', () => {
    const { result } = render();

    act(() => {
      result.current.addRow();
    });

    expect(result.current.rows).toEqual([
      expect.objectContaining({
        server: '',
        header: 'Authorization',
        secret: '',
        key: 'token',
        issue: null,
      }),
    ]);
    expect(result.current.credentials).toEqual([]);
    expect(result.current.blocked).toBe(false);
  });

  it('exposes a complete row as a ready credential', () => {
    const { result } = render();

    addGithubCredential(result);

    expect(result.current.credentials).toEqual([
      expect.objectContaining({
        server: 'github',
        secret: 'u-0123456789abcdef-github',
      }),
    ]);
    expect(result.current.blocked).toBe(false);
  });

  it.each([
    ['an unlabelled server', { server: 'jira' }],
    ['a deleted server', { server: 'gone' }],
    ['an empty key', { key: '' }],
    ['an invalid secret name', { secret: 'Bearer abc' }],
  ])('blocks sending for %s', (_label, patch) => {
    const { result } = render();
    const id = addGithubCredential(result);

    act(() => {
      result.current.updateRow(id, patch);
    });

    expect(result.current.blocked).toBe(true);
    expect(result.current.credentials).toEqual([]);
  });

  it('blocks sending for a repeated header', () => {
    const { result } = render();
    addGithubCredential(result);
    addGithubCredential(result, 'other');

    expect(result.current.blocked).toBe(true);
    expect(result.current.credentials).toHaveLength(1);
  });

  it('blocks sending while the server list loads and when it fails', () => {
    storeRows({ 'team-a': [credential()] });
    mockServers(undefined, true);
    const { result, rerender } = render();
    expect(result.current.blocked).toBe(true);

    mockServers(undefined, false);
    rerender();
    expect(result.current.rows[0].issue).toBe('servers-unavailable');
    expect(result.current.retryServers).toBe(refetch);
  });

  it('changes only the row it is given', () => {
    const { result } = render();
    const first = addGithubCredential(result);
    addGithubCredential(result, 'second');

    act(() => {
      result.current.updateRow(first, { key: 'pat' });
    });

    expect(result.current.rows.map(row => row.key)).toEqual(['pat', 'token']);
  });

  it('stores names only, never a secret value', () => {
    const { result } = render();

    addGithubCredential(result);

    const raw = localStorage.getItem(CHAT_MCP_CREDENTIALS_KEY) ?? '';
    const entries = stored()['team-a'];
    expect(entries).toHaveLength(1);
    expect(Object.keys(entries[0]).sort()).toEqual(
      ['header', 'id', 'key', 'secret', 'server'].sort(),
    );
    expect(raw).not.toMatch(/valueFrom|"value"/);
  });

  it('keeps a pasted token out of local storage', () => {
    const { result } = render();
    const id = addGithubCredential(result);

    act(() => {
      result.current.updateRow(id, { secret: 'Pasted Value!' });
    });

    expect(result.current.rows[0].secret).toBe('Pasted Value!');
    expect(localStorage.getItem(CHAT_MCP_CREDENTIALS_KEY)).not.toContain(
      'Pasted',
    );
    expect(stored()['team-a'][0].secret).toBe('u-0123456789abcdef-github');

    act(() => {
      result.current.updateRow(id, { secret: 'github-token' });
    });
    act(() => {
      result.current.commitRow(id);
    });

    expect(result.current.rows[0]).toMatchObject({
      secret: 'github-token',
      issue: null,
    });
    expect(stored()['team-a'][0].secret).toBe('github-token');
  });

  it('saves a typed secret name only when the field is committed', () => {
    const { result } = render();
    const id = addGithubCredential(result);

    act(() => {
      result.current.updateRow(id, { secret: 'typed-secret' });
    });
    expect(result.current.rows[0].secret).toBe('typed-secret');
    expect(stored()['team-a'][0].secret).toBe('u-0123456789abcdef-github');

    act(() => {
      result.current.commitRow(id);
    });
    expect(stored()['team-a'][0].secret).toBe('typed-secret');
  });

  it('saves a secret picked from the list at once', () => {
    mockListedSecrets(['github-token']);
    const { result } = render();
    const id = addGithubCredential(result, 'typed-secret');

    act(() => {
      result.current.updateRow(id, { secret: 'github-token' });
    });

    expect(stored()['team-a'][0].secret).toBe('github-token');
  });

  it.each([
    ['a UUID', '00000000-0000-0000-0000-000000000000'],
    ['a long run of hex digits', '0123456789abcdef'.repeat(2)],
  ])(
    'keeps %s pasted as the secret out of storage and blocks sending',
    (_label, token) => {
      const { result } = render();
      const id = addGithubCredential(result, 'typed-secret');

      act(() => {
        result.current.updateRow(id, { secret: token });
      });
      act(() => {
        result.current.commitRow(id);
      });

      expect(localStorage.getItem(CHAT_MCP_CREDENTIALS_KEY)).not.toContain(
        token,
      );
      expect(result.current.rows[0]).toMatchObject({
        issue: 'invalid',
        invalidFields: ['secret'],
      });
      expect(result.current.credentials).toEqual([]);
    },
  );

  it('never saves any part of a secret token typed one character at a time', () => {
    const { result } = render();
    const id = addGithubCredential(result, 'typed-secret');
    const typed = '0123456789abcdef'.repeat(2);

    for (let i = 1; i <= typed.length; i++) {
      act(() => {
        result.current.updateRow(id, { secret: typed.slice(0, i) });
      });
    }
    act(() => {
      result.current.commitRow(id);
    });

    expect(localStorage.getItem(CHAT_MCP_CREDENTIALS_KEY)).not.toContain(
      '0123',
    );
    expect(result.current.blocked).toBe(true);
  });

  function mockListedSecrets(names: string[]) {
    vi.mocked(useGetAllSecrets).mockReturnValue({
      data: names.map(name => ({ name })),
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useGetAllSecrets>);
  }

  it('saves the header and key only when the field is committed', () => {
    const { result } = render();
    const id = addGithubCredential(result, 'typed-secret');

    act(() => {
      result.current.updateRow(id, { header: 'X-Token', key: 'pat' });
    });
    expect(result.current.rows[0]).toMatchObject({
      header: 'X-Token',
      key: 'pat',
      issue: null,
    });
    expect(stored()['team-a'][0]).toMatchObject({
      header: 'Authorization',
      key: 'token',
    });

    act(() => {
      result.current.commitRow(id);
    });

    expect(stored()['team-a'][0]).toMatchObject({
      header: 'X-Token',
      key: 'pat',
    });
  });

  it('never saves any part of a token typed one character at a time', () => {
    const { result } = render();
    const id = addGithubCredential(result, 'typed-secret');
    const token = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';

    for (let i = 1; i <= token.length; i++) {
      act(() => {
        result.current.updateRow(id, { key: token.slice(0, i) });
      });
    }
    act(() => {
      result.current.commitRow(id);
    });

    expect(localStorage.getItem(CHAT_MCP_CREDENTIALS_KEY)).not.toContain(
      'AbCd',
    );
    expect(result.current.blocked).toBe(true);
  });

  it('keeps a custom key while a secret name is typed over a listed one', () => {
    mockListedSecrets(['db']);
    const { result } = render();
    const id = addGithubCredential(result, 'typed-secret');
    act(() => {
      result.current.updateRow(id, { key: 'password' });
    });
    act(() => {
      result.current.commitRow(id);
    });

    act(() => {
      result.current.updateRow(id, { secret: 'db' });
    });
    expect(result.current.rows[0]).toMatchObject({
      key: 'token',
      keyLocked: true,
    });
    act(() => {
      result.current.updateRow(id, { secret: 'db-prod' });
    });
    act(() => {
      result.current.commitRow(id);
    });

    expect(stored()['team-a'][0]).toMatchObject({
      secret: 'db-prod',
      key: 'password',
    });
    expect(result.current.rows[0]).toMatchObject({
      key: 'password',
      keyLocked: false,
    });
  });

  it('sends token for a listed secret that arrives after mount', () => {
    vi.mocked(useGetAllSecrets).mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
    } as unknown as ReturnType<typeof useGetAllSecrets>);
    storeRows({ 'team-a': [credential({ key: 'pat' })] });
    const { result, rerender } = render();
    expect(result.current.rows[0].issue).toBe('secrets-pending');

    mockListedSecrets(['github-token']);
    rerender();

    expect(result.current.credentials).toEqual([
      expect.objectContaining({ key: 'token' }),
    ]);
  });

  it('cleans a header, secret and key that an older version saved as tokens', () => {
    storeRows({
      'team-a': [
        credential({
          header: 'sk-proj-abc',
          secret: '00000000-0000-0000-0000-000000000000',
          key: 'ghp_AbC123',
        }),
      ],
    });

    render();

    expect(stored()['team-a'][0]).toMatchObject({
      header: '',
      secret: '',
      key: 'token',
    });
  });

  it('keeps a token pasted as the key out of local storage and blocks sending', () => {
    const { result } = render();
    const id = addGithubCredential(result, 'typed-secret');

    act(() => {
      result.current.updateRow(id, { key: 'ghp_FakeToken1234567890' });
    });
    act(() => {
      result.current.commitRow(id);
    });

    expect(result.current.rows[0].key).toBe('ghp_FakeToken1234567890');
    expect(localStorage.getItem(CHAT_MCP_CREDENTIALS_KEY)).not.toContain(
      'FakeToken',
    );
    expect(result.current.blocked).toBe(true);
    expect(result.current.credentials).toEqual([]);
  });

  it('keeps each namespace separate', () => {
    const { result, rerender } = render();
    addGithubCredential(result, 'team-a-token');

    currentNamespace = 'team-b';
    rerender();
    expect(result.current.rows).toEqual([]);

    addGithubCredential(result, 'team-b-token');
    currentNamespace = 'team-a';
    rerender();

    expect(result.current.rows.map(row => row.secret)).toEqual([
      'team-a-token',
    ]);
    expect(stored()).toEqual({
      'team-a': [expect.objectContaining({ secret: 'team-a-token' })],
      'team-b': [expect.objectContaining({ secret: 'team-b-token' })],
    });
  });

  it('keeps each signed-in user separate', () => {
    vi.mocked(useUser).mockReturnValue({
      user: { email: 'admin@ark.local' },
    });
    const { result, rerender } = render();
    addGithubCredential(result, 'admin-token');

    vi.mocked(useUser).mockReturnValue({
      user: { email: 'viewer@ark.local' },
    });
    rerender();

    expect(result.current.rows).toEqual([]);
    expect(Object.keys(stored())).toEqual(['admin@ark.local/team-a']);
  });

  it('drops the entry when its last row is removed', () => {
    const { result } = render();
    const id = addGithubCredential(result);

    act(() => {
      result.current.removeRow(id);
    });

    expect(result.current.rows).toEqual([]);
    expect(stored()).toEqual({});
  });

  function storeRows(value: unknown) {
    localStorage.setItem(CHAT_MCP_CREDENTIALS_KEY, JSON.stringify(value));
    store = createStore();
  }

  it('restores the rows saved for the namespace', () => {
    storeRows({ 'team-a': [credential()] });

    const { result } = render();

    expect(result.current.credentials).toEqual([credential()]);
  });

  it('replaces a malformed stored value on the next write', () => {
    storeRows(['oops']);
    const { result } = render();

    addGithubCredential(result);

    expect(stored()).toEqual({
      'team-a': [expect.objectContaining({ server: 'github' })],
    });
  });

  it('lists only shared secrets when there is no signed-in user', () => {
    render();

    expect(useGetAllSecrets).toHaveBeenCalledWith('shared', { enabled: true });
  });

  it('lists personal secrets too for a signed-in user', () => {
    vi.mocked(useUser).mockReturnValue({
      user: { name: 'Admin', email: 'admin@ark.local' },
    });

    render();

    expect(useGetAllSecrets).toHaveBeenCalledWith('all', { enabled: true });
  });

  it('fetches nothing when disabled', () => {
    renderHook(() => useChatMcpCredentials({ enabled: false }), { wrapper });

    expect(useGetAllMcpServers).toHaveBeenCalledWith({ enabled: false });
    expect(useGetAllSecrets).toHaveBeenCalledWith('shared', {
      enabled: false,
    });
  });
});
