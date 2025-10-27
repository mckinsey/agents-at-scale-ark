import { Lock, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { ConfirmationDialog } from '@/components/dialogs/confirmation-dialog';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ARK_ANNOTATIONS } from '@/lib/constants/annotations';
import type { Model } from '@/lib/services/models';
import type { Secret } from '@/lib/services/secrets';
import { cn } from '@/lib/utils';
import { getCustomIcon } from '@/lib/utils/icon-resolver';

interface SecretRowProps {
  secret: Secret;
  models: Model[];
  onEdit?: (secret: Secret) => void;
  onDelete?: (id: string) => void;
}

function modelUsesSecret(model: Model, secretName: string): boolean {
  const config = model.config;
  if (!config) return false;

  const checkValueSource = (valueSource: unknown): boolean => {
    if (!valueSource || typeof valueSource !== 'object') return false;
    const source = valueSource as Record<string, unknown>;
    const valueFrom = source.valueFrom as Record<string, unknown> | undefined;
    const secretKeyRef = valueFrom?.secretKeyRef as
      | Record<string, unknown>
      | undefined;
    if (secretKeyRef?.name === secretName) return true;
    return false;
  };

  for (const [, providerConfig] of Object.entries(config)) {
    if (!providerConfig || typeof providerConfig !== 'object') continue;

    for (const [, value] of Object.entries(providerConfig)) {
      if (checkValueSource(value)) return true;
    }
  }

  return false;
}

export function SecretRow({
  secret,
  models,
  onEdit,
  onDelete,
}: SecretRowProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  // Count models using this secret
  const modelsUsingSecret = models.filter(model =>
    modelUsesSecret(model, secret.name),
  );
  const usageCount = modelsUsingSecret.length;
  const isInUse = usageCount > 0;

  // Get custom icon or default Lock icon
  const IconComponent = getCustomIcon(
    secret.annotations?.[ARK_ANNOTATIONS.DASHBOARD_ICON],
    Lock,
  );

  const obfuscatedSecret = '••••••••••••';

  return (
    <>
      <div className="bg-card hover:bg-accent/5 flex w-full items-center gap-4 rounded-md border px-4 py-3 shadow-sm transition-colors xl:w-[49%]">
        <div className="flex flex-grow items-center gap-3 overflow-hidden">
          <IconComponent className="text-muted-foreground h-5 w-5 flex-shrink-0" />

          <div className="flex min-w-0 flex-col gap-1">
            <p className="truncate text-sm font-medium" title={secret.name}>
              {secret.name}
            </p>
            <p className="text-muted-foreground text-xs">{obfuscatedSecret}</p>
          </div>
        </div>

        <div className="text-muted-foreground mr-4 flex-shrink-0 text-sm">
          {isInUse ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger className="cursor-help text-left hover:underline">
                  <span>
                    Used by {usageCount} model{usageCount !== 1 ? 's' : ''}
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-md p-2">
                  <div className="max-h-60 overflow-y-auto">
                    {modelsUsingSecret.map((model, index) => (
                      <div
                        key={model.id}
                        className={`px-2 py-1 ${
                          index % 2 === 0 ? 'bg-white' : 'bg-gray-100'
                        }`}>
                        {model.name}
                      </div>
                    ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <span>Not in use</span>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-1">
          {onEdit && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => onEdit(secret)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit secret</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {onDelete && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'h-8 w-8 p-0',
                      isInUse && 'cursor-not-allowed opacity-50',
                    )}
                    onClick={() => !isInUse && setDeleteConfirmOpen(true)}
                    disabled={isInUse}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isInUse ? 'Cannot delete secret in use' : 'Delete secret'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
      {onDelete && (
        <ConfirmationDialog
          open={deleteConfirmOpen}
          onOpenChange={setDeleteConfirmOpen}
          title="Delete Secret"
          description={`Do you want to delete "${secret.name}" secret? This action cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
          onConfirm={() => onDelete(secret.id)}
          variant="destructive"
        />
      )}
    </>
  );
}
