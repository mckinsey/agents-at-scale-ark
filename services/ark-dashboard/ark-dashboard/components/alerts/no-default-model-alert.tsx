'use client';

import { AlertTriangleIcon, ArrowRight } from 'lucide-react';
import React, { useEffect } from 'react';
import { toast } from 'sonner';

import { NamespacedLink } from '@/components/namespaced-link';
import { Alert, AlertIcon, AlertContent, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useGetAllModels } from '@/lib/services/models-hooks';
import { useNamespace } from '@/providers/NamespaceProvider';

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
          <AlertContent>
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
