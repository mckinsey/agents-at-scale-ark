'use client';

import { useAtom } from 'jotai';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  type StoredMcpCredential,
  readStoredMcpCredentials,
  storedChatMcpCredentialsAtom,
} from '@/atoms/chat-mcp-credentials';
import { buildCustomHeader } from '@/components/forms/shared/custom-header-rows';
import { ARK_LABELS } from '@/lib/constants/labels';
import type { QueryOverride } from '@/lib/services/chat';
import type { MCPServer } from '@/lib/services/mcp-servers';
import { useGetAllMcpServers } from '@/lib/services/mcp-servers-hooks';
import { useGetAllSecrets } from '@/lib/services/secrets-hooks';
import { generateUUID } from '@/lib/utils/uuid';
import { useNamespace } from '@/providers/NamespaceProvider';
import { useUser } from '@/providers/UserProvider';

export const DEFAULT_MCP_CREDENTIAL_HEADER = 'Authorization';
export const DEFAULT_MCP_CREDENTIAL_KEY = 'token';
const MAX_LABEL_VALUE_LENGTH = 63;
const CREDENTIAL_FIELDS = ['server', 'header', 'secret', 'key'] as const;
const MAX_NAME_LENGTH = 253;
const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const SECRET_NAME_PATTERN = /^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/;
const SECRET_KEY_PATTERN = /^[-._a-zA-Z0-9]+$/;
const TOKEN_PREFIX_PATTERN =
  /^(gh[pousr]_|github_pat_|glpat-|sk[-_]|rk_|hf_|npm_|dop_v1_|xox[abeoprs]-|xapp-|AIza|AKIA|ASIA|eyJ)/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_RUN_PATTERN = /[A-Za-z0-9]{24,}/;
const TYPED_FIELDS = ['header', 'secret', 'key'] as const;

type McpServerTarget = Pick<MCPServer, 'name' | 'labels'>;

export type McpServerTargetIssue = 'unlabelled' | 'name-too-long' | 'ambiguous';

export type McpCredentialField = (typeof CREDENTIAL_FIELDS)[number];

export type McpCredentialIssue =
  | McpServerTargetIssue
  | 'server-missing'
  | 'servers-pending'
  | 'servers-unavailable'
  | 'secrets-pending'
  | 'invalid'
  | 'incomplete'
  | 'duplicate';

export interface McpCredentialRow extends StoredMcpCredential {
  issue: McpCredentialIssue | null;
  invalidFields: McpCredentialField[];
  keyLocked: boolean;
}

export type McpCredentialPatch = Partial<
  Pick<StoredMcpCredential, 'server' | 'header' | 'secret' | 'key'>
>;

type McpCredentialDrafts = Record<string, McpCredentialPatch>;

export type McpServersState = {
  servers: readonly McpServerTarget[] | undefined;
  isPending: boolean;
};

const FIELD_VALIDATORS: Record<
  Exclude<McpCredentialField, 'server'>,
  RegExp
> = {
  header: HEADER_NAME_PATTERN,
  secret: SECRET_NAME_PATTERN,
  key: SECRET_KEY_PATTERN,
};

function looksLikeOpaqueValue(value: string): boolean {
  return UUID_PATTERN.test(value) || TOKEN_RUN_PATTERN.test(value);
}

export function looksLikeToken(value: string): boolean {
  const trimmed = value.trim();
  return TOKEN_PREFIX_PATTERN.test(trimmed) || looksLikeOpaqueValue(trimmed);
}

export function isValidMcpCredentialField(
  field: McpCredentialField,
  value: string,
): boolean {
  const trimmed = value.trim();
  if (field === 'server' || trimmed === '') {
    return true;
  }
  if (
    field === 'secret' ? looksLikeOpaqueValue(trimmed) : looksLikeToken(trimmed)
  ) {
    return false;
  }
  return (
    trimmed.length <= MAX_NAME_LENGTH && FIELD_VALIDATORS[field].test(trimmed)
  );
}

export function getMcpServerTargetIssue(
  server: McpServerTarget,
  servers: readonly McpServerTarget[] = [],
): McpServerTargetIssue | null {
  if (server.name.length > MAX_LABEL_VALUE_LENGTH) {
    return 'name-too-long';
  }
  if (server.labels?.[ARK_LABELS.NAME] !== server.name) {
    return 'unlabelled';
  }
  const claimedByAnother = servers.some(
    other =>
      other.name !== server.name &&
      other.labels?.[ARK_LABELS.NAME] === server.name,
  );
  return claimedByAnother ? 'ambiguous' : null;
}

function isBlank(credential: StoredMcpCredential): boolean {
  return credential.server === '' && credential.secret.trim() === '';
}

function isIncomplete(credential: StoredMcpCredential): boolean {
  return (
    credential.server === '' ||
    credential.header.trim() === '' ||
    credential.secret.trim() === '' ||
    credential.key.trim() === ''
  );
}

function serverIssue(
  credential: StoredMcpCredential,
  { servers, isPending }: McpServersState,
): McpCredentialIssue | null {
  if (credential.server === '') {
    return null;
  }
  if (!servers) {
    return isPending ? 'servers-pending' : 'servers-unavailable';
  }
  const server = servers.find(entry => entry.name === credential.server);
  if (!server) {
    return 'server-missing';
  }
  return getMcpServerTargetIssue(server, servers);
}

export function evaluateMcpCredentials(
  credentials: readonly StoredMcpCredential[],
  serversState: McpServersState,
  drafts: McpCredentialDrafts = {},
  listedSecrets: ReadonlySet<string> = new Set(),
  secretsPending = false,
): McpCredentialRow[] {
  const seen = new Set<string>();

  return credentials.map(stored => {
    const merged = { ...stored, ...drafts[stored.id] };
    const keyLocked = listedSecrets.has(merged.secret.trim());
    const credential = keyLocked
      ? { ...merged, key: DEFAULT_MCP_CREDENTIAL_KEY }
      : merged;
    const invalidFields = (['header', 'secret', 'key'] as const).filter(
      field => !isValidMcpCredentialField(field, credential[field]),
    );
    if (isBlank(credential) && invalidFields.length === 0) {
      return { ...credential, issue: null, invalidFields, keyLocked };
    }
    let issue = serverIssue(credential, serversState);
    if (
      !issue &&
      secretsPending &&
      credential.key.trim() !== DEFAULT_MCP_CREDENTIAL_KEY
    ) {
      issue = 'secrets-pending';
    }
    if (!issue && invalidFields.length > 0) {
      issue = 'invalid';
    }
    if (!issue && isIncomplete(credential)) {
      issue = 'incomplete';
    }
    const target = `${credential.server}\n${credential.header.trim().toLowerCase()}`;
    if (!issue && seen.has(target)) {
      issue = 'duplicate';
    }
    seen.add(target);
    return { ...credential, issue, invalidFields, keyLocked };
  });
}

export function readyMcpCredentials(
  rows: readonly McpCredentialRow[],
): StoredMcpCredential[] {
  return rows
    .filter(row => !isBlank(row) && row.issue === null)
    .map(({ id, server, header, secret, key }) => ({
      id,
      server,
      header: header.trim(),
      secret: secret.trim(),
      key: key.trim(),
    }));
}

export function buildMcpCredentialOverrides(
  credentials: readonly StoredMcpCredential[],
): QueryOverride[] {
  const byServer = new Map<string, QueryOverride>();
  for (const credential of credentials) {
    const header = buildCustomHeader({
      key: credential.id,
      name: credential.header,
      type: 'secret',
      value: credential.secret,
      secretKey: credential.key,
    });
    const existing = byServer.get(credential.server);
    if (existing) {
      existing.headers.push(header);
    } else {
      byServer.set(credential.server, {
        resourceType: 'mcpserver',
        labelSelector: {
          matchLabels: { [ARK_LABELS.NAME]: credential.server },
        },
        headers: [header],
      });
    }
  }
  return [...byServer.values()];
}

export function mcpCredentialStorageKey(
  namespace: string,
  owner: string | null | undefined,
): string {
  return owner ? `${owner}/${namespace}` : namespace;
}

function splitPatch(
  patch: McpCredentialPatch,
  holdFields: readonly McpCredentialField[] = [],
): {
  valid: McpCredentialPatch;
  invalid: McpCredentialPatch;
} {
  const valid: McpCredentialPatch = {};
  const invalid: McpCredentialPatch = {};
  for (const field of CREDENTIAL_FIELDS) {
    const value = patch[field];
    if (value === undefined) {
      continue;
    }
    if (
      !holdFields.includes(field) &&
      isValidMcpCredentialField(field, value)
    ) {
      valid[field] = value;
    } else {
      invalid[field] = value;
    }
  }
  return { valid, invalid };
}

function sanitizeStoredCredential(
  credential: StoredMcpCredential,
): StoredMcpCredential {
  return {
    ...credential,
    header: isValidMcpCredentialField('header', credential.header)
      ? credential.header
      : '',
    secret: isValidMcpCredentialField('secret', credential.secret)
      ? credential.secret
      : '',
    key: isValidMcpCredentialField('key', credential.key)
      ? credential.key
      : DEFAULT_MCP_CREDENTIAL_KEY,
  };
}

function needsSanitizing(credential: StoredMcpCredential): boolean {
  return (
    !isValidMcpCredentialField('header', credential.header) ||
    !isValidMcpCredentialField('secret', credential.secret) ||
    !isValidMcpCredentialField('key', credential.key)
  );
}

type UseChatMcpCredentialsOptions = {
  enabled?: boolean;
};

export function useChatMcpCredentials({
  enabled = true,
}: UseChatMcpCredentialsOptions = {}) {
  const { namespace } = useNamespace();
  const { user } = useUser();
  const [stored, setStored] = useAtom(storedChatMcpCredentialsAtom);
  const [drafts, setDrafts] = useState<McpCredentialDrafts>({});
  const servers = useGetAllMcpServers({ enabled });
  const secrets = useGetAllSecrets(user ? 'all' : 'shared', { enabled });
  const storageKey = mcpCredentialStorageKey(namespace, user?.email);
  const listedSecrets = useMemo(
    () => new Set((secrets.data ?? []).map(secret => secret.name)),
    [secrets.data],
  );

  const credentials = useMemo(
    () => readStoredMcpCredentials(stored, storageKey),
    [stored, storageKey],
  );

  const rows = useMemo(
    () =>
      evaluateMcpCredentials(
        credentials,
        { servers: servers.data, isPending: servers.isPending },
        drafts,
        listedSecrets,
        secrets.isPending,
      ),
    [
      credentials,
      servers.data,
      servers.isPending,
      drafts,
      listedSecrets,
      secrets.isPending,
    ],
  );

  const ready = useMemo(() => readyMcpCredentials(rows), [rows]);

  const writeCredentials = useCallback(
    (
      update: (current: StoredMcpCredential[]) => StoredMcpCredential[],
    ): void => {
      setStored(previous => {
        const next = update(readStoredMcpCredentials(previous, storageKey));
        const byKey =
          previous && typeof previous === 'object' && !Array.isArray(previous)
            ? { ...previous }
            : {};
        if (next.length === 0) {
          delete byKey[storageKey];
        } else {
          byKey[storageKey] = next;
        }
        return byKey;
      });
    },
    [storageKey, setStored],
  );

  useEffect(() => {
    if (credentials.some(needsSanitizing)) {
      writeCredentials(current => current.map(sanitizeStoredCredential));
    }
  }, [credentials, writeCredentials]);

  const addRow = useCallback((): string => {
    const id = generateUUID();
    writeCredentials(current => [
      ...current,
      {
        id,
        server: '',
        header: DEFAULT_MCP_CREDENTIAL_HEADER,
        secret: '',
        key: DEFAULT_MCP_CREDENTIAL_KEY,
      },
    ]);
    return id;
  }, [writeCredentials]);

  const updateRow = useCallback(
    (id: string, patch: McpCredentialPatch) => {
      const pickedListedSecret =
        patch.secret !== undefined && listedSecrets.has(patch.secret.trim());
      const { valid, invalid } = splitPatch(
        patch,
        pickedListedSecret ? ['header', 'key'] : TYPED_FIELDS,
      );
      setDrafts(current => {
        const draft = { ...current[id] };
        for (const field of CREDENTIAL_FIELDS) {
          if (valid[field] !== undefined) {
            delete draft[field];
          }
        }
        const next = { ...current, [id]: { ...draft, ...invalid } };
        if (Object.keys(next[id]).length === 0) {
          delete next[id];
        }
        return next;
      });
      if (Object.keys(valid).length > 0) {
        writeCredentials(current =>
          current.map(credential =>
            credential.id === id ? { ...credential, ...valid } : credential,
          ),
        );
      }
    },
    [writeCredentials, listedSecrets],
  );

  const commitRow = useCallback(
    (id: string) => {
      const draft = drafts[id];
      if (!draft) {
        return;
      }
      const committed: McpCredentialPatch = {};
      for (const field of TYPED_FIELDS) {
        const value = draft[field];
        if (value !== undefined && isValidMcpCredentialField(field, value)) {
          committed[field] = value;
        }
      }
      if (Object.keys(committed).length === 0) {
        return;
      }
      setDrafts(current => {
        const next = { ...current, [id]: { ...current[id] } };
        for (const field of Object.keys(committed) as McpCredentialField[]) {
          if (next[id][field] === committed[field]) {
            delete next[id][field];
          }
        }
        if (Object.keys(next[id]).length === 0) {
          delete next[id];
        }
        return next;
      });
      writeCredentials(current =>
        current.map(credential =>
          credential.id === id ? { ...credential, ...committed } : credential,
        ),
      );
    },
    [drafts, writeCredentials],
  );

  const removeRow = useCallback(
    (id: string) => {
      setDrafts(current => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      writeCredentials(current =>
        current.filter(credential => credential.id !== id),
      );
    },
    [writeCredentials],
  );

  return {
    rows,
    credentials: ready,
    blocked: rows.some(row => row.issue !== null),
    servers: servers.data ?? [],
    isServersPending: servers.isPending,
    retryServers: servers.refetch,
    secrets: secrets.data,
    isSecretsPending: secrets.isPending,
    isSecretsError: secrets.isError,
    addRow,
    updateRow,
    commitRow,
    removeRow,
  };
}

export type ChatMcpCredentials = ReturnType<typeof useChatMcpCredentials>;
