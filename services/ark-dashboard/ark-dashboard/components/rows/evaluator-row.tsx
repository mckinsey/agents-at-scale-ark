'use client';

import { Globe, Pencil, Settings, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Evaluator } from '@/lib/services';

interface EvaluatorRowProps {
  evaluator: Evaluator;
  onDelete?: (id: string) => void;
}

export function EvaluatorRow({ evaluator, onDelete }: EvaluatorRowProps) {
  const router = useRouter();

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

    return info.length > 0 ? info.join(', ') : null;
  };

  return (
    <>
      <div className="bg-card hover:bg-accent/5 flex w-full items-center gap-4 rounded-md border px-4 py-3 transition-colors">
        <div className="flex flex-1 items-center gap-3">
          <div className="flex-shrink-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gradient-to-br from-purple-500 to-purple-600">
              <Settings className="h-5 w-5 text-white" />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold">
                {evaluator.name}
              </h3>
            </div>

            <div className="text-muted-foreground flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1">
                <Globe className="h-3 w-3" />
                <span className="max-w-[150px] truncate">
                  {getAddressDisplay()}
                </span>
              </div>

              {getSpecInfo() && (
                <div className="hidden sm:block">
                  <Badge variant="secondary" className="text-xs">
                    {getSpecInfo()}
                  </Badge>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    router.push(`/evaluators/${evaluator.name}/edit`)
                  }
                  className="h-8 w-8 p-0">
                  <Pencil className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Edit evaluator</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {onDelete && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(evaluator.name)}
                    className="text-destructive hover:text-destructive h-8 w-8 p-0">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Delete evaluator</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
    </>
  );
}
