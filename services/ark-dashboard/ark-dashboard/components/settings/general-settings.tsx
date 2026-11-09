'use client';

import { useSetAtom } from 'jotai';

import { restartOnboardingAtom } from '@/atoms/onboarding';
import { Button } from '@/components/ui/button';
import { FieldDescription, FieldSet, FieldTitle } from '@/components/ui/field';
import { useNamespacedNavigation } from '@/lib/hooks/use-namespaced-navigation';

export function GeneralSettings() {
  const { push } = useNamespacedNavigation();
  const restartOnboarding = useSetAtom(restartOnboardingAtom);

  const handleTakeTourAgain = () => {
    restartOnboarding();
    push('/');
  };

  return (
    <div className="flex max-w-[600px] flex-col gap-6">
      <FieldSet className="gap-2">
        <FieldTitle>Guided tour</FieldTitle>
        <FieldDescription>
          Walk through the main areas of Ark again, starting from the welcome
          screen.
        </FieldDescription>
        <div>
          <Button type="button" variant="outline" onClick={handleTakeTourAgain}>
            Take tour again
          </Button>
        </div>
      </FieldSet>
    </div>
  );
}
