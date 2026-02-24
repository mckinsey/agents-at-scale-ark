import { Check } from 'lucide-react';

interface GraphEndProps {
  className?: string;
}

export function GraphEnd({ className }: Readonly<GraphEndProps>) {
  return (
    <div
      className={`flex items-center justify-center gap-2 py-2 ${className || ''}`}>
      <div className="bg-muted/50 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs">
        <Check className="text-muted-foreground h-3.5 w-3.5" />
        <span className="text-muted-foreground">Conversation ended because agent graph has no outgoing edges</span>
      </div>
    </div>
  );
}
