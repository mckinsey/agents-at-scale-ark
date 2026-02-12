import { RefreshCw } from 'lucide-react';

interface StrategyIndicatorProps {
  strategy: string;
}

export function StrategyIndicator({ strategy }: StrategyIndicatorProps) {
  if (strategy !== 'round-robin') {
    return null;
  }

  return (
    <div className="flex items-center justify-center gap-2 py-2">
      <div className="bg-muted/50 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs">
        <RefreshCw className="text-muted-foreground h-3.5 w-3.5" />
        <span className="text-muted-foreground">
          Agents respond in round-robin order
        </span>
      </div>
    </div>
  );
}
