import { Badge } from '@/components/ui/badge';
import type { MCPServerAuthorization } from '@/lib/services/mcp-servers';
import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

interface StateConfig {
  label: string;
  variant: BadgeVariant;
  className?: string;
}

const STATE_CONFIG: Record<string, StateConfig> = {
  Required: {
    label: 'Auth required',
    variant: 'outline',
    className:
      'border-amber-500 text-amber-700 dark:border-amber-400 dark:text-amber-300',
  },
  Authorized: {
    label: 'Authorized',
    variant: 'outline',
    className:
      'border-green-600 text-green-700 dark:border-green-500 dark:text-green-400',
  },
  DiscoveryFailed: {
    label: 'Discovery failed',
    variant: 'destructive',
  },
};

interface McpAuthBadgeProps {
  authorization?: MCPServerAuthorization | null;
}

export function McpAuthBadge({ authorization }: McpAuthBadgeProps) {
  if (!authorization?.state) {
    return null;
  }
  const config = STATE_CONFIG[authorization.state];
  if (!config) {
    return null;
  }
  const title = authorization.authorizedBy
    ? `Authorized by ${authorization.authorizedBy}`
    : undefined;
  return (
    <Badge variant={config.variant} className={cn(config.className)} title={title}>
      {config.label}
    </Badge>
  );
}
