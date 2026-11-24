'use client';

import { useMemo } from 'react';

import type { SecretListScope, SecretScope } from '@/lib/services/secrets';
import { useGetAllSecrets } from '@/lib/services/secrets-hooks';

const USABLE_SECRET_TYPE = 'Opaque';

export interface SecretKeyOption {
  value: string;
  label: string;
  secretName: string;
  secretKey: string;
  scope: SecretScope;
}

export interface UseSecretKeyOptionsParams {
  scope?: SecretListScope;
  enabled?: boolean;
}

export function secretOptionValue(
  secretName: string,
  secretKey: string,
): string {
  return `${secretName}/${secretKey}`;
}

export function useSecretKeyOptions({
  scope = 'shared',
  enabled = true,
}: UseSecretKeyOptionsParams = {}) {
  const { data, isSuccess, isError } = useGetAllSecrets(scope, { enabled });

  const options = useMemo<SecretKeyOption[]>(
    () =>
      (data ?? [])
        .filter(secret => secret.type === USABLE_SECRET_TYPE)
        .flatMap(secret =>
          (secret.keys ?? []).map(key => ({
            value: secretOptionValue(secret.name, key),
            label: `${secret.display_name} · ${key}`,
            secretName: secret.name,
            secretKey: key,
            scope: secret.scope,
          })),
        ),
    [data],
  );

  return { options, loaded: isSuccess || isError };
}
