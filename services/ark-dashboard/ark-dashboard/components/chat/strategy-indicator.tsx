import {
  ArrowRight,
  MousePointerClick,
  RefreshCw,
} from 'lucide-react';

interface StrategyIndicatorProps {
  strategy?: string;
  selectorAgentName?: string;
  loops?: boolean;
}

export function StrategyIndicator({
  strategy,
  selectorAgentName,
  loops,
}: Readonly<StrategyIndicatorProps>) {
  if (strategy === 'sequential' && loops) {
    return (
      <div className="flex items-center justify-center gap-2 py-2">
        <div className="bg-muted/50 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs">
          <RefreshCw className="text-muted-foreground h-3.5 w-3.5" />
          <span className="text-muted-foreground">
            Agents respond in sequential loop
          </span>
        </div>
      </div>
    );
  }

  if (strategy === 'sequential') {
    return (
      <div className="flex items-center justify-center gap-2 py-2">
        <div className="bg-muted/50 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs">
          <ArrowRight className="text-muted-foreground h-3.5 w-3.5" />
          <span className="text-muted-foreground">
            Agents respond in sequential order
          </span>
        </div>
      </div>
    );
  }

  if (strategy === 'selector') {
    return (
      <div className="flex items-center justify-center gap-2 py-2">
        <div className="bg-muted/50 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs">
          <MousePointerClick className="text-muted-foreground h-3.5 w-3.5" />
          <span className="text-muted-foreground">
            {selectorAgentName || 'AI selector'} chooses each respondent
          </span>
        </div>
      </div>
    );
  }

  return null;
}
