import { Tag } from '@/components/ui/tag';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export const MAX_VISIBLE_LABELS = 3;

interface TagOverflowListProps<T> {
  readonly items: readonly T[];
  readonly maxVisible: number;
  readonly getKey: (item: T) => string;
  readonly getLabel: (item: T) => string;
  readonly tagClassName?: string;
}

export function TagOverflowList<T>({
  items,
  maxVisible,
  getKey,
  getLabel,
  tagClassName = 'max-w-[120px] overflow-hidden',
}: Readonly<TagOverflowListProps<T>>) {
  if (items.length === 0) {
    return <span className="text-fg-secondary text-sm leading-5">-</span>;
  }

  const visible = items.slice(0, maxVisible);
  const overflow = items.length - visible.length;

  return (
    <div className="flex min-w-0 items-center gap-1 overflow-hidden">
      {visible.map(item => (
        <Tag
          key={getKey(item)}
          variant="primary"
          size="sm"
          className={tagClassName}
          title={getLabel(item)}>
          <span className="truncate">{getLabel(item)}</span>
        </Tag>
      ))}
      {overflow > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Tag variant="primary" size="sm" className="shrink-0">
              +{overflow}
            </Tag>
          </TooltipTrigger>
          <TooltipContent>
            <div className="flex flex-col gap-1">
              {items.slice(maxVisible).map(item => (
                <span key={getKey(item)}>{getLabel(item)}</span>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

export function LabelsCell({ labels }: Readonly<{ labels: readonly string[] }>) {
  return (
    <TagOverflowList
      items={labels}
      maxVisible={MAX_VISIBLE_LABELS}
      getKey={label => label}
      getLabel={label => label}
    />
  );
}
