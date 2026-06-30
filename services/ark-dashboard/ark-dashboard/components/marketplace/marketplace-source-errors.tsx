'use client';

import { AlertCircle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { MarketplaceSourceError } from '@/lib/api/generated/marketplace-types';

interface MarketplaceSourceErrorsProps {
  errors?: MarketplaceSourceError[];
}

// Surfaces per-source fetch failures (e.g. 401/403 on an authenticated source)
// instead of silently dropping those items from the grid.
export function MarketplaceSourceErrors({ errors }: MarketplaceSourceErrorsProps) {
  if (!errors || errors.length === 0) return null;
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Some marketplace sources could not be loaded</AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-4">
          {errors.map(error => (
            <li key={error.source}>
              <span className="font-medium">{error.displayName}</span>:{' '}
              {error.code === 'auth_error' ? 'authentication failed' : error.message}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
