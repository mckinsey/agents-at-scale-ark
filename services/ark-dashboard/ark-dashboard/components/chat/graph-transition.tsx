import { ArrowDown } from 'lucide-react';

interface GraphTransitionProps {
  from: string;
  to: string;
  className?: string;
}

export function GraphTransition({
  from,
  to,
  className,
}: Readonly<GraphTransitionProps>) {
  return (
    <div
      className={`flex items-center justify-center gap-2 py-2 ${className || ''}`}>
      <div className="bg-muted/50 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs">
        <ArrowDown className="text-muted-foreground h-3.5 w-3.5" />
        <span className="text-muted-foreground">
          {from} &rarr; {to}
        </span>
      </div>
    </div>
  );
}
