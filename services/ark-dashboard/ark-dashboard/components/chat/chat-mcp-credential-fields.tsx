'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { SecretNameField } from '@/components/forms/fields/secret-name-field';
import { Add, ChevronDown, Info, Trash } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field';
import { IconShell } from '@/components/ui/icon-shell';
import { Input } from '@/components/ui/input';
import {
  GHOST_TRIGGER,
  Select,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ARK_LABELS } from '@/lib/constants/labels';
import {
  type ChatMcpCredentials,
  type McpCredentialField,
  type McpCredentialIssue,
  type McpCredentialPatch,
  type McpCredentialRow,
  type McpServerTargetIssue,
  getMcpServerTargetIssue,
  looksLikeToken,
} from '@/lib/hooks/use-chat-mcp-credentials';

interface Props {
  readonly credentials: ChatMcpCredentials;
  readonly disabled?: boolean;
}

const TARGET_ISSUES: ReadonlySet<McpCredentialIssue> = new Set([
  'unlabelled',
  'name-too-long',
  'ambiguous',
  'server-missing',
]);

const SERVER_ISSUES: ReadonlySet<McpCredentialIssue> = new Set([
  ...TARGET_ISSUES,
  'servers-pending',
  'servers-unavailable',
]);

const SERVER_OPTION_HINTS: Record<McpServerTargetIssue, string> = {
  unlabelled: 'Needs name label',
  'name-too-long': 'Name over 63 characters',
  ambiguous: 'Name label also on another server',
};

const SERVER_OPTION_TITLES: Record<McpServerTargetIssue, string> = {
  unlabelled: `This MCP server has no ${ARK_LABELS.NAME} label yet. Ark adds it the next time the server is updated.`,
  'name-too-long':
    'MCP server names over 63 characters cannot be picked by name.',
  ambiguous: `Another MCP server still carries this ${ARK_LABELS.NAME} label from before Ark set it, so it could get the header too.`,
};

function issueMessage(row: McpCredentialRow): string | null {
  switch (row.issue) {
    case 'unlabelled':
      return `The MCP server ${row.server} has no ${ARK_LABELS.NAME} label yet. Update it once and Ark adds the label.`;
    case 'name-too-long':
      return 'MCP server names over 63 characters cannot be picked by name.';
    case 'ambiguous':
      return `Another MCP server still carries ${ARK_LABELS.NAME}=${row.server} from before Ark set name labels and could get this header. Update that server once.`;
    case 'server-missing':
      return `The MCP server ${row.server} is not in this namespace.`;
    case 'servers-pending':
      return 'Checking MCP servers…';
    case 'servers-unavailable':
      return "Couldn't load the MCP servers, so this credential can't be checked.";
    case 'secrets-pending':
      return 'Checking secrets…';
    case 'invalid':
      return invalidMessage(row);
    case 'incomplete':
      return 'Fill in every field or remove this credential.';
    case 'duplicate':
      return `Another credential already sends ${row.header.trim()} to ${row.server}.`;
    default:
      return null;
  }
}

function invalidMessage(row: McpCredentialRow): string {
  const fields = row.invalidFields;
  if (fields.includes('secret')) {
    return 'Enter the name of a secret, not its value. Names use lowercase letters, digits, "-" and ".".';
  }
  if ((['header', 'key'] as const).some(field => looksLikeToken(row[field]))) {
    return 'This looks like a token. Store it in a secret and pick the secret here.';
  }
  if (fields.includes('header')) {
    return 'Header names cannot contain spaces or special characters.';
  }
  return 'Keys use letters, digits, "-", "_" and ".".';
}

function invalidControls(row: McpCredentialRow): Set<McpCredentialField> {
  if (!row.issue) {
    return new Set();
  }
  if (SERVER_ISSUES.has(row.issue)) {
    return new Set(['server']);
  }
  if (row.issue === 'invalid') {
    return new Set(row.invalidFields);
  }
  if (row.issue === 'duplicate') {
    return new Set(['header']);
  }
  return new Set(
    (['server', 'header', 'secret', 'key'] as const).filter(
      field => row[field].trim() === '',
    ),
  );
}

const ABOUT_TOOLTIP =
  'Send a header from a secret to one MCP server with every message in this chat. ' +
  `Only MCP servers labelled with ${ARK_LABELS.NAME} can be picked. ` +
  'When you are signed in, your personal secrets are listed too. ' +
  'Choices are kept per namespace in this browser, as names only. ' +
  'Put tokens in a secret; never paste one into these fields.';

const KEY_TITLE_LOCKED = 'Secrets in Ark keep their value under the token key.';
const KEY_TITLE =
  'The key inside the secret that holds the value, usually token. Never paste a token here.';

interface CredentialRowProps {
  readonly row: McpCredentialRow;
  readonly index: number;
  readonly servers: ChatMcpCredentials['servers'];
  readonly secrets: ChatMcpCredentials['secrets'];
  readonly isSecretsPending: boolean;
  readonly isSecretsError: boolean;
  readonly onChange: (id: string, patch: McpCredentialPatch) => void;
  readonly onCommit: (id: string) => void;
  readonly onRemove: (id: string) => void;
  readonly onRetryServers: () => void;
  readonly disabled?: boolean;
}

const ADD_BUTTON_FOCUS = 'add-button';

function serverTriggerId(rowId: string) {
  return `mcp-credential-server-${rowId}`;
}

function CredentialRow({
  row,
  index,
  servers,
  secrets,
  isSecretsPending,
  isSecretsError,
  onChange,
  onCommit,
  onRemove,
  onRetryServers,
  disabled,
}: CredentialRowProps) {
  const hintId = useId();
  const message = issueMessage(row);
  const invalid = invalidControls(row);
  const fieldsDisabled =
    disabled || (row.issue !== null && TARGET_ISSUES.has(row.issue));
  const subject = row.server || `credential ${index + 1}`;
  const groupLabel = row.server
    ? `Credential for ${row.server}`
    : `Credential ${index + 1}`;
  const describedBy = message ? hintId : undefined;

  return (
    <div
      role="group"
      aria-label={groupLabel}
      aria-describedby={describedBy}
      className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <Select
          value={row.server || null}
          onValueChange={value =>
            onChange(row.id, {
              server: typeof value === 'string' ? value : '',
            })
          }
          disabled={disabled}>
          <SelectTrigger
            id={serverTriggerId(row.id)}
            className={`${GHOST_TRIGGER} w-40 shrink-0`}
            aria-label={`MCP server for ${subject}`}
            aria-invalid={invalid.has('server') || undefined}
            aria-describedby={invalid.has('server') ? describedBy : undefined}>
            <SelectValue placeholder="Choose MCP server" />
          </SelectTrigger>
          <SelectContent>
            {servers.map(server => {
              const issue = getMcpServerTargetIssue(server, servers);
              return (
                <SelectItem
                  key={server.name}
                  value={server.name}
                  disabled={issue !== null}
                  title={issue ? SERVER_OPTION_TITLES[issue] : undefined}>
                  <SelectItemText>{server.name}</SelectItemText>
                  {issue && (
                    <span className="text-fg-secondary label-small-primary ml-2">
                      {SERVER_OPTION_HINTS[issue]}
                    </span>
                  )}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        <Input
          variant="inline"
          size="sm"
          value={row.header}
          onChange={e => onChange(row.id, { header: e.target.value })}
          onBlur={() => onCommit(row.id)}
          placeholder="Header name"
          disabled={fieldsDisabled}
          aria-label={`Header name for ${subject}`}
          aria-invalid={invalid.has('header') || undefined}
          aria-describedby={invalid.has('header') ? describedBy : undefined}
          className="min-w-0 flex-1"
        />

        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={() => onRemove(row.id)}
          disabled={disabled}
          aria-label={`Remove ${groupLabel.toLowerCase()}`}>
          <IconShell size="sm" variant="secondary">
            <Trash />
          </IconShell>
        </Button>
      </div>

      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <SecretNameField
            value={row.secret}
            onChange={value => onChange(row.id, { secret: value })}
            secrets={secrets}
            isPending={isSecretsPending}
            isError={isSecretsError}
            disabled={fieldsDisabled}
            invalid={invalid.has('secret')}
            aria-label={`Secret for ${subject}`}
          />
        </div>
        <Input
          variant="inline"
          size="sm"
          value={row.key}
          onChange={e => onChange(row.id, { key: e.target.value })}
          onBlur={() => onCommit(row.id)}
          placeholder="Secret key"
          title={row.keyLocked ? KEY_TITLE_LOCKED : KEY_TITLE}
          readOnly={row.keyLocked}
          disabled={fieldsDisabled}
          aria-label={`Secret key for ${subject}`}
          aria-invalid={invalid.has('key') || undefined}
          aria-describedby={invalid.has('key') ? describedBy : undefined}
          className="w-28 shrink-0"
        />
      </div>

      {message &&
        (row.issue === 'servers-pending' || row.issue === 'secrets-pending' ? (
          <p id={hintId} className="text-fg-secondary text-sm">
            {message}
          </p>
        ) : (
          <FieldError id={hintId} className="flex items-center gap-2">
            <span>{message}</span>
            {row.issue === 'servers-unavailable' && (
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={onRetryServers}>
                Retry
              </Button>
            )}
          </FieldError>
        ))}
    </div>
  );
}

export function ChatMcpCredentialFields({
  credentials,
  disabled,
}: Readonly<Props>) {
  const {
    rows,
    blocked,
    addRow,
    updateRow,
    commitRow,
    removeRow,
    retryServers,
    servers,
    secrets,
    isSecretsPending,
    isSecretsError,
  } = credentials;
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const isExpanded = blocked || (expanded ?? rows.length > 0);

  useEffect(() => {
    if (focusTarget === ADD_BUTTON_FOCUS && addButtonRef.current) {
      addButtonRef.current.focus();
      setFocusTarget(null);
    } else if (focusTarget && rows.some(row => row.id === focusTarget)) {
      document.getElementById(serverTriggerId(focusTarget))?.focus();
      setFocusTarget(null);
    }
  }, [focusTarget, rows]);

  const handleRemove = (id: string) => {
    const index = rows.findIndex(row => row.id === id);
    const next = rows[index + 1] ?? rows[index - 1];
    removeRow(id);
    if (next) {
      setFocusTarget(next.id);
    } else {
      setExpanded(true);
      setFocusTarget(ADD_BUTTON_FOCUS);
    }
  };

  return (
    <div className="border-stroke-divider flex flex-col gap-3 border-b pb-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-fg-secondary text-sm">MCP credentials</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="About MCP credentials"
                className="text-fg-secondary hover:text-fg-primary">
                <IconShell size="sm" variant="secondary">
                  <Info />
                </IconShell>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" align="start">
              {ABOUT_TOOLTIP}
            </TooltipContent>
          </Tooltip>
        </div>
        {!blocked && (
          <button
            type="button"
            onClick={() => setExpanded(!isExpanded)}
            aria-label={
              isExpanded ? 'Collapse MCP credentials' : 'Expand MCP credentials'
            }
            aria-expanded={isExpanded}
            className="text-fg-secondary hover:text-fg-primary">
            <IconShell size="sm" variant="secondary">
              <ChevronDown className={isExpanded ? 'rotate-180' : ''} />
            </IconShell>
          </button>
        )}
      </div>

      {isExpanded && (
        <div className="flex flex-col gap-3">
          <Button
            ref={addButtonRef}
            type="button"
            size="icon-xs"
            variant="outline"
            onClick={() => setFocusTarget(addRow())}
            disabled={disabled}
            aria-label="Add MCP credential">
            <IconShell size="sm">
              <Add />
            </IconShell>
          </Button>

          {rows.length === 0 ? (
            <p className="text-fg-secondary text-sm">
              No credentials. MCP servers get only the headers they are
              configured with.
            </p>
          ) : (
            <div className="flex max-h-[220px] flex-col gap-4 overflow-y-auto">
              {rows.map((row, index) => (
                <CredentialRow
                  key={row.id}
                  row={row}
                  index={index}
                  servers={servers}
                  secrets={secrets}
                  isSecretsPending={isSecretsPending}
                  isSecretsError={isSecretsError}
                  onChange={updateRow}
                  onCommit={commitRow}
                  onRemove={handleRemove}
                  onRetryServers={() => {
                    retryServers();
                  }}
                  disabled={disabled}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
