import { Warning } from '@/components/icons';
import { IconShell } from '@/components/ui/icon-shell';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { TruncatedTooltip } from '@/components/ui/truncated-tooltip';

interface A2AEndpointValueProps {
  readonly endpoint: string;
  readonly mismatch: boolean;
}

export function A2AEndpointValue({
  endpoint,
  mismatch,
}: Readonly<A2AEndpointValueProps>) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <TruncatedTooltip
        label={endpoint}
        contentClassName="max-w-[420px] [overflow-wrap:anywhere]">
        <span className="min-w-0 truncate">{endpoint}</span>
      </TruncatedTooltip>
      {mismatch && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="text-status-warning focus-visible:ring-stroke-status-focus label-regular-primary inline-flex shrink-0 items-center gap-1 outline-none focus-visible:ring-2">
              <IconShell size="sm" className="text-status-warning opacity-100">
                <Warning />
              </IconShell>
              Mismatch
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-[320px]">
            Ark sends messages to this endpoint, but the agent card asks for a
            different path (see Card URL). To use the card&apos;s URL, set
            endpointResolution to cardUrl or cardPath on this A2A server.
          </TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}
