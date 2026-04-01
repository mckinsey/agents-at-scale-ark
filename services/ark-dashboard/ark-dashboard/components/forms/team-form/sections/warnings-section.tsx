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
        Neither the agents nor the selector have access to the terminate tool, which may prevent the conversation from terminating gracefully. Enable the terminate tool for the selector, or give one or more agents in the team access to the terminate tool.
      </AlertDescription>
    </Alert>
  );
}
