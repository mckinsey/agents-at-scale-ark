'use client';

import { AlertTriangleIcon, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import React, { useEffect } from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
      <Link href="/models/new?name=default">
        <Alert variant="warning" className="flex flex-row flex-wrap gap-2">
          <div className="flex items-center gap-1">
            <AlertTriangleIcon className="h-4 w-4" />
            <AlertTitle>You have no default Model configured.</AlertTitle>
          </div>
          <AlertDescription className="text-primary ml-auto flex items-center">
            <span>Configure Default Model</span>
            <ArrowRight className="h-4 w-4" />
          </AlertDescription>
        </Alert>
      </Link>
    );
  }

  return null;
}
