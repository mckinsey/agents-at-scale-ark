'use client';

import { AlertTriangleIcon, ArrowRight } from 'lucide-react';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { NamespacedLink } from '@/components/namespaced-link';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertIcon,
  AlertTitle,
} from '@/components/ui/alert';
import { useGetAllModels } from '@/lib/services/models-hooks';

export function NoDefaultModelAlert() {
  const { data: models, error } = useGetAllModels();

  useEffect(() => {
    if (error) {
      toast.error('Failed to get Models', {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    }
  }, [error]);

  if (models && !models.some(m => m.name === 'default')) {
    return (
      <NamespacedLink href="/models/new?name=default">
        <Alert layout="long">
          <AlertIcon className="text-status-warning">
            <AlertTriangleIcon className="text-[25px]" />
          </AlertIcon>
          <AlertContent className="flex-row items-center justify-between gap-3 pt-0">
            <AlertTitle>You have no default Model configured.</AlertTitle>
            <AlertDescription className="text-primary flex items-center">
              <span>Configure Default Model</span>
              <ArrowRight className="h-4 w-4" />
            </AlertDescription>
          </AlertContent>
        </Alert>
      </NamespacedLink>
    );
  }

  return null;
}
