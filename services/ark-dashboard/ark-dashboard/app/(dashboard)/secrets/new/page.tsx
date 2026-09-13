'use client';

import { useCallback } from 'react';

import { SecretForm, SecretFormMode } from '@/components/forms/secret-form';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';

export default function SecretNewPage() {
  const { push } = useNamespacedNavigation();

  const onSuccess = useCallback(() => {
    push('/secrets');
  }, [push]);

  return <SecretForm mode={SecretFormMode.CREATE} onSuccess={onSuccess} />;
}
