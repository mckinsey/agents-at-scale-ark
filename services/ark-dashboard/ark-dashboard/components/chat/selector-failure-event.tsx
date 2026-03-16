import { AlertTriangle } from 'lucide-react';

interface SelectorFailureEventProps {
  message?: string;
  className?: string;
}

export function SelectorFailureEvent({
  message,
  className,
}: Readonly<SelectorFailureEventProps>) {
  const match = message?.match(/invalid agent name: (.+)$/);
  const selectedName = match ? match[1] : 'unknown';
  const label = `Selector returned invalid agent: ${selectedName}. Ending conversation`;

  return (
    <div
      className={`flex items-center justify-center gap-2 py-0.5 ${className || ''}`}>
      <div className="bg-orange-100 dark:bg-orange-900/20 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs">
        <AlertTriangle className="text-orange-600 dark:text-orange-400 h-3.5 w-3.5" />
        <span className="text-orange-600 dark:text-orange-400">{label}</span>
      </div>
    </div>
  );
}
