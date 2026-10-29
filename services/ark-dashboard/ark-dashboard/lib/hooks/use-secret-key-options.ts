'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { secretsService } from '@/lib/services';
import { GET_ALL_SECRETS_QUERY_KEY } from '@/lib/services/secrets-hooks';
import { useNamespace } from '@/providers/NamespaceProvider';

const USABLE_SECRET_TYPE = 'Opaque';

export interface SecretKeyOption {
  value: string;
  label: string;
  secretName: string;
  secretKey: string;
}

export function secretOptionValue(
  secretName: string,
  secretKey: string,
): string {
  return `${secretName}/${secretKey}`;
}

export function useSecretKeyOptions(enabled = true) {
  const { namespace } = useNamespace();
  const { data, isSuccess, isError } = useQuery({
    queryKey: [GET_ALL_SECRETS_QUERY_KEY, namespace],
    queryFn: () => secretsService.getAll(namespace),
    enabled: enabled && Boolean(namespace),
  });

  const options = useMemo<SecretKeyOption[]>(
    () =>
      (data ?? [])
        .filter(secret => secret.type === USABLE_SECRET_TYPE)
        .flatMap(secret =>
          (secret.keys ?? []).map(key => ({
            value: secretOptionValue(secret.name, key),
            label: `${secret.name} · ${key}`,
            secretName: secret.name,
            secretKey: key,
          })),
        ),
    [data],
  );

  return { options, loaded: isSuccess || isError };
}
