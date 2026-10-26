'use client';

import { OpenInNew, VpnKey } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { IconShell } from '@/components/ui/icon-shell';
import {
  HeaderRowsHeading,
  McpHeaderColumnLabels,
  McpHeaderRowFields,
} from '@/components/ui/mcp-header-row';
import { useSecretKeyOptions } from '@/lib/hooks/use-secret-key-options';
import { cn } from '@/lib/utils';
import {
  type McpHeaderRow,
  type McpHeaderRowError,
  headerNameOptions,
  isBlankMcpHeaderRow,
  serverHeaderNames,
} from '@/lib/utils/mcp-header-overrides';

const HEADERS_TOOLTIP_TEXT =
  'Header overrides are added to every call this agent makes to a matching MCP server. Use a secret for tokens so the value is never stored on the agent itself. A query can override any header set here.';

export interface McpHeaderOverridesEditorProps {
  readonly rows: McpHeaderRow[];
  readonly errors: Record<string, McpHeaderRowError>;
  readonly serverNames: string[];
  readonly headerNamesByServer: Record<string, string[]>;
  readonly disabled?: boolean;
  readonly onAddRow: () => void;
  readonly onUpdateRow: (id: string, updates: Partial<McpHeaderRow>) => void;
  readonly onRemoveRow: (id: string) => void;
  readonly className?: string;
}

export function McpHeaderOverridesEditor({
  rows,
  errors,
  serverNames,
  headerNamesByServer,
  disabled,
  onAddRow,
  onUpdateRow,
  onRemoveRow,
  className,
}: McpHeaderOverridesEditorProps) {
  const { options, loaded } = useSecretKeyOptions();
  const namesForServer = (serverName?: string) =>
    serverHeaderNames(serverName, serverNames, headerNamesByServer);
  const canAdd = namesForServer(undefined).length > 0;

  return (
    <div
      className={cn('flex flex-col gap-5', className)}
      data-testid="mcp-header-overrides">
      <HeaderRowsHeading
        title="MCP header overrides"
        tooltip={HEADERS_TOOLTIP_TEXT}
        count={rows.filter(row => !isBlankMcpHeaderRow(row)).length}
        disabled={disabled || !canAdd}
        onAdd={onAddRow}
      />

      {rows.length === 0 && (
        <div className="border-stroke-tertiary flex flex-col gap-2 border border-dashed p-4">
          <p className="text-fg-secondary text-sm">
            No header overrides are sent to MCP servers. Select an MCP tool and
            its server&apos;s headers appear here. Servers without headers
            cannot be overridden.
          </p>
          <div className="flex items-center gap-1">
            <NamespacedLink
              href="/secrets"
              className="text-fg-secondary inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2 hover:opacity-80">
              <IconShell size="sm">
                <VpnKey />
              </IconShell>
              Manage secrets
              <IconShell size="sm">
                <OpenInNew />
              </IconShell>
            </NamespacedLink>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex flex-col gap-2">
          <McpHeaderColumnLabels />

          {rows.map(row => (
            <McpHeaderRowFields
              key={row.id}
              row={row}
              serverNames={serverNames}
              nameOptions={headerNameOptions(
                row,
                rows,
                namesForServer(row.serverName),
              )}
              namesForServer={namesForServer}
              secretOptions={options}
              secretsLoaded={loaded}
              error={errors[row.id]}
              disabled={disabled}
              onChange={updates => onUpdateRow(row.id, updates)}
              onRemove={() => onRemoveRow(row.id)}
            />
          ))}

          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-fg-tertiary text-xs">
              Headers for All MCP servers go to every MCP server this agent
              calls.
            </span>
            <NamespacedLink
              href="/secrets"
              className="text-fg-secondary inline-flex shrink-0 items-center gap-1 text-xs underline underline-offset-2 hover:opacity-80">
              <IconShell size="sm">
                <VpnKey />
              </IconShell>
              Create a secret
            </NamespacedLink>
          </div>
        </div>
      )}
    </div>
  );
}
