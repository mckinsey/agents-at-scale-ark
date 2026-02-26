import { MousePointerClick } from 'lucide-react';

interface SelectorTransitionProps {
  agentName: string;
  selectorAgentName?: string;
  className?: string;
}

export function SelectorTransition({
  agentName,
  selectorAgentName,
  className,
}: Readonly<SelectorTransitionProps>) {
  return (
    <div
      className={`flex items-center justify-center gap-2 py-2 ${className || ''}`}>
      <div className="bg-muted/50 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs">
        <MousePointerClick className="text-muted-foreground h-3.5 w-3.5" />
        <span className="text-muted-foreground">
          {selectorAgentName || 'Selector'} chose {agentName}
        </span>
      </div>
    </div>
  );
}
