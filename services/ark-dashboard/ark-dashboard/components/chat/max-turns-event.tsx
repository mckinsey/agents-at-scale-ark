import { AlertCircle } from 'lucide-react';

interface MaxTurnsEventProps {
  message?: string;
  className?: string;
}

export function MaxTurnsEvent({
  message,
  className,
}: Readonly<MaxTurnsEventProps>) {
  const match = message?.match(/\((\d+)\)/);
  const label = match
    ? `Maximum turns reached (${match[1]})`
    : 'Maximum turns reached';

  return (
    <div
      className={`flex items-center justify-center gap-2 py-2 ${className || ''}`}>
      <div className="bg-muted/50 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs">
        <AlertCircle className="text-muted-foreground h-3.5 w-3.5" />
        <span className="text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}
