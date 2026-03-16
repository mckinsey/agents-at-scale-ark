'use client';

import { useAtom } from 'jotai';

import { experimentalFeatureGroups } from '@/components/experimental-features-dialog/experimental-features';
import type {
  BooleanSetting,
  SelectSetting,
} from '@/components/experimental-features-dialog/types';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

function BooleanFeatureRow({ feature }: { feature: BooleanSetting }) {
  const [value, setValue] = useAtom(feature.atom);
  return (
    <div className="flex flex-row items-center justify-between rounded-lg border p-4">
      <div className="space-y-0.5">
        <Label>{feature.feature}</Label>
        {feature.description && (
          <div className="text-muted-foreground text-sm">
            {feature.description}
          </div>
        )}
      </div>
      <Switch checked={value} onCheckedChange={setValue} />
    </div>
  );
}

function SelectFeatureRow({ feature }: { feature: SelectSetting }) {
  const [value, setValue] = useAtom(feature.atom);
  return (
    <div className="flex flex-row items-center justify-between rounded-lg border p-4">
      <div className="flex-1 space-y-0.5">
        <Label>{feature.feature}</Label>
        {feature.description && (
          <div className="text-muted-foreground text-sm">
            {feature.description}
          </div>
        )}
      </div>
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger className="w-[180px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {feature.options.map(option => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ExperimentalFeaturesSettings() {
  return (
    <div className="space-y-6">
      {experimentalFeatureGroups.map(group => (
        <div key={group.groupKey}>
          {group.groupLabel && (
            <h2 className="mb-4 text-lg font-semibold">{group.groupLabel}</h2>
          )}
          {group.features.map(feature =>
            feature.type === 'boolean' ? (
              <BooleanFeatureRow key={feature.feature} feature={feature} />
            ) : (
              <SelectFeatureRow key={feature.feature} feature={feature} />
            ),
          )}
        </div>
      ))}
    </div>
  );
}
