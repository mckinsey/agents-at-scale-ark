'use client';

import { Globe, Pencil, Settings, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { DASHBOARD_SECTIONS } from '@/lib/constants/dashboard-icons';
import type { Evaluator } from '@/lib/services';

import { BaseCard, type BaseCardAction } from './base-card';

interface EvaluatorCardProps {
  evaluator: Evaluator;
  onDelete?: (id: string) => void;
}

export function EvaluatorCard({ evaluator, onDelete }: EvaluatorCardProps) {
  const router = useRouter();

  const actions: BaseCardAction[] = [
    {
      icon: Pencil,
      label: 'Edit evaluator',
      onClick: () => router.push(`/evaluators/${evaluator.name}/edit`),
    },
  ];

  if (onDelete) {
    actions.push({
      icon: Trash2,
      label: 'Delete evaluator',
      onClick: () => onDelete(evaluator.name),
    });
  }

  const getAddressDisplay = () => {
    return evaluator.address || 'Not configured';
  };

  const getSpecInfo = () => {
    const spec = (evaluator as { spec?: Record<string, unknown> }).spec;
    if (!spec) return null;

    const info = [];
    if ((spec.modelRef as { name?: string })?.name) {
      info.push(`Model: ${(spec.modelRef as { name: string }).name}`);
    }
    if ((spec.parameters as unknown[])?.length > 0) {
      info.push(
        `${(spec.parameters as unknown[]).length} parameter${(spec.parameters as unknown[]).length > 1 ? 's' : ''}`,
      );
    }
    if (spec.selector) {
      info.push('Auto-selector enabled');
    }

    return info;
  };

  const specInfo = getSpecInfo();

  return (
    <>
      <BaseCard
        title={evaluator.name}
        description={evaluator.description}
        icon={DASHBOARD_SECTIONS.evaluators.icon}
        actions={actions}
        footer={
          <div className="space-y-2">
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <Globe className="h-4 w-4" />
              <span>{getAddressDisplay()}</span>
            </div>
            {specInfo && specInfo.length > 0 && (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Settings className="h-4 w-4" />
                <span>{specInfo.join(', ')}</span>
              </div>
            )}
          </div>
        }
      />
    </>
  );
}
