import type { ReactNode } from 'react';

import { IconShell } from '@/components/ui/icon-shell';

interface ResourcePageHeaderProps {
  readonly icon: ReactNode;
  readonly title: ReactNode;
  readonly description: ReactNode;
  readonly actions?: ReactNode;
  readonly testId?: string;
}

export function ResourcePageHeader({
  icon,
  title,
  description,
  actions,
  testId,
}: Readonly<ResourcePageHeaderProps>) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex flex-col gap-1" data-testid={testId}>
        <div className="flex items-center gap-1">
          <IconShell size="default" variant="primary">
            {icon}
          </IconShell>
          <h1 className="headings-h2-regular text-fg-primary">{title}</h1>
        </div>
        <p className="paragraph-regular-primary text-fg-secondary">
          {description}
        </p>
      </div>
      {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
    </div>
  );
}
