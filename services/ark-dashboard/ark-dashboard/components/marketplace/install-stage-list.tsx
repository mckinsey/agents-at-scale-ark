'use client';

import { Cancel, CheckCircle } from '@/components/icons';
import { StatusBadge } from '@/components/ui/badge';
import { IconShell } from '@/components/ui/icon-shell';
import { Spinner } from '@/components/ui/spinner';
import type { InstallStage } from '@/lib/services/marketplace-install-types';

function StageIcon({ state }: Readonly<{ state: InstallStage['state'] }>) {
  if (state === 'running') {
    return <Spinner size="sm" className="text-fg-primary" />;
  }

  if (state === 'done') {
    return (
      <IconShell size="sm" className="text-status-success">
        <CheckCircle />
      </IconShell>
    );
  }

  if (state === 'failed') {
    return (
      <IconShell size="sm" className="text-status-error">
        <Cancel />
      </IconShell>
    );
  }

  return <StatusBadge variant="neutral" size="sm" />;
}

export function InstallStageList({
  stages,
}: Readonly<{ stages: InstallStage[] }>) {
  return (
    <ol className="flex flex-col gap-4">
      {stages.map(stage => (
        <li key={stage.id} className="flex items-center gap-3">
          <span className="flex size-4 items-center justify-center">
            <StageIcon state={stage.state} />
          </span>
          <span
            className={
              stage.state === 'pending'
                ? 'paragraph-regular-primary text-fg-tertiary'
                : 'paragraph-regular-primary text-fg-primary'
            }>
            {stage.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function currentStageLabel(stages: InstallStage[]): string {
  return (
    stages.find(stage => stage.state === 'running')?.label ??
    stages.findLast(stage => stage.state !== 'pending')?.label ??
    stages[0]?.label ??
    ''
  );
}
