import { Square } from 'lucide-react';

export function ConversationStoppedEvent() {
  return (
    <div className="flex items-center justify-center gap-2 py-2">
      <div className="bg-muted/50 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs">
        <Square className="text-muted-foreground h-3.5 w-3.5" />
        <span className="text-muted-foreground">
          Conversation stopped by user
        </span>
      </div>
    </div>
  );
}
