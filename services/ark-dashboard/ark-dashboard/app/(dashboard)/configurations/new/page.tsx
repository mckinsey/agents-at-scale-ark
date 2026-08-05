'use client';

import { useCallback } from 'react';

import {
  ConfigurationForm,
  ConfigurationFormMode,
} from '@/components/forms/configuration-form';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';

export default function ConfigurationNewPage() {
  const { push } = useNamespacedNavigation();

  const goToList = useCallback(() => {
    push('/configurations');
  }, [push]);

  return (
    <ConfigurationForm
      mode={ConfigurationFormMode.CREATE}
      onSuccess={goToList}
      onCancel={goToList}
    />
  );
}
