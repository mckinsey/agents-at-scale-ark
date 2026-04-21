'use client';

import { Card, CardContent } from '@/components/ui/card';

interface Props {
  sessionId: string;
}

export function ConversationsTab({ sessionId }: Props) {
  return (
    <Card>
      <CardContent className="py-8 text-center text-muted-foreground">
        Conversations tab - Coming in Iteration 3
        <div className="mt-2 text-xs">Session: {sessionId}</div>
      </CardContent>
    </Card>
  );
}
