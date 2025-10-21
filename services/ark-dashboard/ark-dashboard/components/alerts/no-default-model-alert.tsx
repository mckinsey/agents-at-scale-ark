"use client"
import { useGetAllModels } from '@/lib/services/models-hooks';
import React, { useEffect } from 'react'
import { toast } from "sonner"
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangleIcon, ArrowRight } from 'lucide-react';

export function NoDefaultModelAlert() {
  const { data: models, error } = useGetAllModels();

  useEffect(() => {
    if (error) {
      toast.error("Failed to get Models", {
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred"
      });
    }
  }, [error]);

  if (models && !models.some(m => m.name === 'default')) {
    return (
      <Link href="/models/new?name=default">
        <Alert variant='warning' className="flex gap-2 flex-row flex-wrap">
          <div className="flex items-center gap-1">
            <AlertTriangleIcon className="w-4 h-4" />
            <AlertTitle>You have no default Model configured.</AlertTitle>
          </div>
          <AlertDescription className="flex text-primary items-center ml-auto">
            <span>Configure Default Model</span>
            <ArrowRight className="h-4 w-4" />
          </AlertDescription>
        </Alert>
      </Link>
    )
  }

  return null
}