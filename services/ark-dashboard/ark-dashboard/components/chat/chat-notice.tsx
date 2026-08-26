import type { ReactNode } from 'react';

import { IconShell } from '@/components/ui/icon-shell';
import { cn } from '@/lib/utils';

interface ChatNoticeProps {
  readonly icon: ReactNode;
  readonly iconClassName?: string;
  readonly children: ReactNode;
}

export function ChatNotice({
  icon,
  iconClassName,
  children,
}: Readonly<ChatNoticeProps>) {
  return (
    <div className="bg-fill-onsurface-ui-3 text-fg-secondary flex items-center gap-2 rounded-full px-4 py-2">
      <IconShell className={cn('shrink-0', iconClassName)}>{icon}</IconShell>
      <span className="text-sm">{children}</span>
    </div>
  );
}
