'use client';

import { useParams } from 'next/navigation';
import { useCallback } from 'react';

import { SecretForm, SecretFormMode } from '@/components/forms/secret-form';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';

export default function SecretEditPage() {
  const params = useParams();
  const { push } = useNamespacedNavigation();
  const secretName = decodeURIComponent(params.name as string);

  const goToList = useCallback(() => {
    push('/secrets');
  }, [push]);

  return (
    <SecretForm
      mode={SecretFormMode.EDIT}
      secretName={secretName}
      onSuccess={goToList}
      onCancel={goToList}
    />
  );
}
