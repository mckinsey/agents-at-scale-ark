import { TruncatedTooltip } from '@/components/ui/truncated-tooltip';
import {
  type AliasableResource,
  displayName,
  hasAlias,
} from '@/lib/utils/resource-display';

interface AliasedNameCellProps {
  readonly resource: AliasableResource;
}

const TOOLTIP_CONTENT_CLASS = 'max-w-[320px] text-left break-all';

export function AliasedNameCell({ resource }: AliasedNameCellProps) {
  const alias = hasAlias(resource) ? displayName(resource) : null;

  return (
    <span className="flex min-w-0 flex-col">
      <TruncatedTooltip
        label={resource.name}
        contentClassName={TOOLTIP_CONTENT_CLASS}>
        <span className="text-fg-primary block truncate">{resource.name}</span>
      </TruncatedTooltip>
      {alias && (
        <TruncatedTooltip
          label={alias}
          contentClassName={TOOLTIP_CONTENT_CLASS}>
          <span className="text-fg-tertiary label-small-primary block truncate">
            Alias: {alias}
          </span>
        </TruncatedTooltip>
      )}
    </span>
  );
}
