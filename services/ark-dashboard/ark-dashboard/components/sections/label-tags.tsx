import { Tag } from '@/components/ui/tag';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const MAX_VISIBLE_LABELS = 3;

interface LabelTagsProps {
  readonly labels: readonly string[];
}

export function LabelTags({ labels }: LabelTagsProps) {
  if (labels.length === 0) {
    return <span className="text-fg-secondary text-sm leading-5">-</span>;
  }

  const visible = labels.slice(0, MAX_VISIBLE_LABELS);
  const overflow = labels.length - visible.length;

  return (
    <div className="flex min-w-0 items-center gap-1 overflow-hidden">
      {visible.map(label => (
        <Tag
          key={label}
          variant="primary"
          size="sm"
          className="max-w-[120px] overflow-hidden"
          title={label}>
          <span className="truncate">{label}</span>
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
              {labels.slice(MAX_VISIBLE_LABELS).map(label => (
                <span key={label}>{label}</span>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
