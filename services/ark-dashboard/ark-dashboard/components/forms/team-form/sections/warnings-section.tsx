import { AlertCircle } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import type { TeamMember } from '@/lib/services';

interface WarningsSectionProps {
  selectedMembers: TeamMember[];
  strategy: string;
  enableTerminateTool?: boolean;
}

export function WarningsSection({
  selectedMembers,
  strategy,
  enableTerminateTool,
}: Readonly<WarningsSectionProps>) {
  if (strategy !== 'selector' || selectedMembers.length === 0) {
    return null;
  }

  if (enableTerminateTool !== false) {
    return null;
  }

  return (
    <Alert variant="warning">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>
        The terminate tool is disabled. The team may not be able to end the conversation gracefully.
      </AlertDescription>
    </Alert>
  );
}
