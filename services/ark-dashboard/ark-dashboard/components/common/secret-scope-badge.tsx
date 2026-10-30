import { Badge } from '@/components/ui/badge';
import type { SecretScope } from '@/lib/services/secrets';
import { cn } from '@/lib/utils';

export const SECRET_SCOPE_LABELS: Record<SecretScope, string> = {
  shared: 'Shared',
  personal: 'Personal',
};

interface SecretScopeBadgeProps {
  readonly scope: SecretScope;
  readonly className?: string;
}

export function SecretScopeBadge({
  scope,
  className,
}: Readonly<SecretScopeBadgeProps>) {
  return (
    <Badge
      size="sm"
      variant={scope === 'personal' ? 'high-emphasis' : 'alternative'}
      outline={scope === 'shared'}
      className={cn('shrink-0', className)}>
      {SECRET_SCOPE_LABELS[scope]}
    </Badge>
  );
}
