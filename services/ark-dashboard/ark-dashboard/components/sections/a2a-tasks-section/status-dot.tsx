import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export type StatusDotVariant =
  | 'completed'
  | 'running'
  | 'failed'
  | 'pending'
  | 'unknown';

export interface StatusDotProps {
  variant: StatusDotVariant;
}

export function StatusDot({ variant }: StatusDotProps) {
  const getVariantClasses = () => {
    switch (variant) {
      case 'completed':
        return 'bg-green-300';
      case 'failed':
        return 'bg-red-300';
      case 'running':
        return 'bg-blue-300';
      case 'pending':
        return 'bg-yellow-300';
      case 'unknown':
      default:
        return 'bg-gray-300';
    }
  };

  const getStatusName = () => {
    switch (variant) {
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      case 'running':
        return 'Running';
      case 'pending':
        return 'Pending';
      default:
        return 'Unknown';
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <span
            data-testid="status-dot"
            className={`inline-flex h-[16px] w-[16px] items-center rounded-full px-2 py-1 text-xs font-medium ${getVariantClasses()}`}
          />
        </TooltipTrigger>
        <TooltipContent>
          <p>{getStatusName()}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
