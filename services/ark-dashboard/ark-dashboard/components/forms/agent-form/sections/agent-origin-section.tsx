'use client';

import { Info, OpenInNew } from '@/components/icons';
import { FieldSet, FieldTitle } from '@/components/ui/field';
import { IconActionButton } from '@/components/ui/icon-action-button';
import { IconShell } from '@/components/ui/icon-shell';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';
import { getOriginLabel } from '@/lib/utils/origin-icon';

interface OpenA2AServerButtonProps {
  readonly serverName: string;
}

function OpenA2AServerButton({
  serverName,
}: Readonly<OpenA2AServerButtonProps>) {
  const { push } = useNamespacedNavigation();
  return (
    <IconActionButton
      label={`Open A2A server ${serverName}`}
      tooltip="Open A2A server"
      onClick={() => push(`/a2a/${encodeURIComponent(serverName)}`)}>
      <OpenInNew />
    </IconActionButton>
  );
}

export function A2AManagedInfo() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="Why this agent can't be edited"
          className="focus-visible:ring-stroke-status-focus inline-flex outline-none focus-visible:ring-2">
          <IconShell size="sm" className="opacity-100">
            <Info />
          </IconShell>
        </button>
      </TooltipTrigger>
      <TooltipContent>
        This agent can&apos;t be edited. To change it, update the A2A server.
      </TooltipContent>
    </Tooltip>
  );
}

interface AgentStreamingFieldProps {
  readonly streamingSupported?: string | null;
}

function formatStreaming(value?: string | null): string {
  if (value === 'true') return 'True';
  if (value === 'false') return 'False';
  return '—';
}

export function AgentStreamingField({
  streamingSupported,
}: Readonly<AgentStreamingFieldProps>) {
  return (
    <FieldSet className="gap-2">
      <FieldTitle>Streaming</FieldTitle>
      <Input
        variant="inline"
        aria-label="Streaming"
        value={formatStreaming(streamingSupported)}
        disabled
        readOnly
      />
    </FieldSet>
  );
}

interface AgentOriginFieldProps {
  readonly origin?: string | null;
  readonly a2aServerName?: string | null;
}

export function AgentOriginField({
  origin,
  a2aServerName,
}: Readonly<AgentOriginFieldProps>) {
  return (
    <FieldSet className="gap-2">
      <FieldTitle>Origin</FieldTitle>
      {a2aServerName ? (
        <div className="flex items-center gap-1">
          <p className="label-regular-primary text-fg-primary">
            A2A server · {a2aServerName}
          </p>
          <OpenA2AServerButton serverName={a2aServerName} />
        </div>
      ) : (
        <p className="label-regular-primary text-fg-primary">
          {getOriginLabel(origin)}
        </p>
      )}
    </FieldSet>
  );
}
