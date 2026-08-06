'use client';

import { TruncatedTooltip } from '@/components/ui/truncated-tooltip';
import type { ConfigurationDetailResponse } from '@/lib/services/configurations';

const TOOLTIP_CONTENT_CLASS =
  'max-w-[360px] text-left font-mono break-all whitespace-pre-wrap';

const TOOLTIP_MAX_CHARACTERS = 600;
const TOOLTIP_MAX_LINES = 12;

function clampForTooltip(value: string): string {
  const clamped =
    value.length > TOOLTIP_MAX_CHARACTERS
      ? `${value.slice(0, TOOLTIP_MAX_CHARACTERS)}…`
      : value;

  const lines = clamped.split('\n');
  if (lines.length <= TOOLTIP_MAX_LINES) {
    return clamped;
  }

  return `${lines.slice(0, TOOLTIP_MAX_LINES).join('\n')}\n…`;
}

interface ConfigurationValueCellProps {
  readonly configuration: ConfigurationDetailResponse;
}

export function ConfigurationValueCell({
  configuration,
}: Readonly<ConfigurationValueCellProps>) {
  const value = configuration.value?.trim() ?? '';

  if (!value) {
    return <span className="text-fg-secondary block">-</span>;
  }

  return (
    <TruncatedTooltip
      label={clampForTooltip(value)}
      contentClassName={TOOLTIP_CONTENT_CLASS}>
      <span className="text-fg-secondary block truncate font-mono">
        {value.replace(/\s+/g, ' ')}
      </span>
    </TruncatedTooltip>
  );
}
