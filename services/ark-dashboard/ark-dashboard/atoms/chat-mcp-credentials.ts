import { atomWithStorage } from 'jotai/utils';

export const CHAT_MCP_CREDENTIALS_KEY = 'chat-mcp-credentials';

export interface StoredMcpCredential {
  id: string;
  server: string;
  header: string;
  secret: string;
  key: string;
}

export type StoredMcpCredentialsByNamespace = Record<
  string,
  StoredMcpCredential[]
>;

export const storedChatMcpCredentialsAtom =
  atomWithStorage<StoredMcpCredentialsByNamespace>(
    CHAT_MCP_CREDENTIALS_KEY,
    {},
    undefined,
    { getOnInit: true },
  );

function isStoredMcpCredential(value: unknown): value is StoredMcpCredential {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'server' in value &&
    typeof value.server === 'string' &&
    'header' in value &&
    typeof value.header === 'string' &&
    'secret' in value &&
    typeof value.secret === 'string' &&
    'key' in value &&
    typeof value.key === 'string'
  );
}

export function readStoredMcpCredentials(
  stored: unknown,
  storageKey: string,
): StoredMcpCredential[] {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return [];
  }
  const entries = new Map(Object.entries(stored)).get(storageKey);
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries
    .filter(isStoredMcpCredential)
    .map(({ id, server, header, secret, key }) => ({
      id,
      server,
      header,
      secret,
      key,
    }));
}
