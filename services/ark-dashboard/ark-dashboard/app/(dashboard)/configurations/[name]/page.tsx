'use client';

import { useParams } from 'next/navigation';
import { useCallback } from 'react';

import {
  ConfigurationForm,
  ConfigurationFormMode,
} from '@/components/forms/configuration-form';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';

export default function ConfigurationEditPage() {
  const params = useParams();
  const configurationName = decodeURIComponent(params.name as string);
  const { push } = useNamespacedNavigation();

  const onSuccess = useCallback(() => {
    push('/configurations');
  }, [push]);

  return (
    <ConfigurationForm
      mode={ConfigurationFormMode.EDIT}
      configurationName={configurationName}
      onSuccess={onSuccess}
    />
  );
}
