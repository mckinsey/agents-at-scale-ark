'use client';

import { useAtom } from 'jotai';
import React, { useCallback, useEffect, useState } from 'react';

import { storedIsExperimentalDarkModeEnabledAtom } from '@/atoms/experimental-features';
import { experimentalFeaturesDialogOpenAtom } from '@/atoms/internal-states';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

import { experimentalFeatureGroups } from './experimental-features';
import type {
  BooleanSetting,
  ExperimentalFeature,
  NumberSetting,
} from './types';

const EXPERIMENTAL_MODAL_KEYBOARD_SHORTCUT = 'e';

type BooleanFeatureToggleProps = {
  feature: BooleanSetting;
};

function BooleanFeatureToggle({ feature }: BooleanFeatureToggleProps) {
  const [atomValue, setAtom] = useAtom(feature.atom);

  const toggleAtomValue = useCallback(
    (checked: boolean) => {
      setAtom(checked);
    },
    [setAtom],
  );

  const isDarkModeFeature =
    feature.atom === storedIsExperimentalDarkModeEnabledAtom;
  const label = isDarkModeFeature
    ? atomValue
      ? 'Light mode'
      : 'Dark mode'
    : feature.feature;

  return (
    <div className="flex flex-row items-center justify-between">
      <div className="space-y-0.5">
        <Label>{label}</Label>
        {feature.description && (
          <div className="text-muted-foreground text-sm">
            {feature.description}
          </div>
        )}
      </div>
      <Switch checked={atomValue} onCheckedChange={toggleAtomValue} />
    </div>
  );
}

type NumberFeatureProps = {
  feature: NumberSetting;
};

function NumberFeature({ feature }: Readonly<NumberFeatureProps>) {
  const [atomValue, setAtom] = useAtom(feature.atom);

  const [draft, setDraft] = useState(
    () => `${Number.parseInt(atomValue, 10) || ''}`,
  );

  const handleChange = (raw: string) => {
    setDraft(raw);
    if (/^\d+$/.test(raw) && Number(raw) > 0) {
      setAtom(`${raw}m`);
    }
  };

  return (
    <div className="flex flex-row items-center justify-between">
      <div className="flex-1 space-y-0.5">
        <Label>{feature.feature}</Label>
        {feature.description && (
          <div className="text-muted-foreground text-sm">
            {feature.description}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={draft}
          onChange={e => handleChange(e.target.value)}
          className="w-[120px]"
        />
        <span className="text-muted-foreground text-sm">minutes</span>
      </div>
    </div>
  );
}

type ExperimentalFeatureToggleProps = {
  feature: ExperimentalFeature;
};

function ExperimentalFeatureToggle({
  feature,
}: ExperimentalFeatureToggleProps) {
  if (feature.type === 'boolean') {
    return <BooleanFeatureToggle feature={feature} />;
  }
  return <NumberFeature feature={feature} />;
}

export function ExperimentalFeaturesDialog() {
  const [isDialogOpen, setIsDialogOpen] = useAtom(
    experimentalFeaturesDialogOpenAtom,
  );

  const toggleModal = useCallback(() => {
    setIsDialogOpen(prev => !prev);
  }, [setIsDialogOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === EXPERIMENTAL_MODAL_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        toggleModal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleModal]);

  return (
    <Dialog open={isDialogOpen} onOpenChange={toggleModal}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        onOpenAutoFocus={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Configure application settings</DialogDescription>
        </DialogHeader>
        <div className="space-y-6 px-2 py-4">
          {experimentalFeatureGroups.map(
            ({ groupKey, groupLabel, features }) => (
              <section key={groupKey} className="space-y-2">
                {groupLabel && (
                  <Label className="text-base font-bold">{groupLabel}</Label>
                )}
                <div className="space-y-4">
                  {features.map(feature => (
                    <ExperimentalFeatureToggle
                      key={feature.feature}
                      feature={feature}
                    />
                  ))}
                </div>
              </section>
            ),
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
