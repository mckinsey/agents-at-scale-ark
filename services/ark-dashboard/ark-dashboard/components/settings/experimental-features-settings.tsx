'use client';

import { useAtom } from 'jotai';
import { useState } from 'react';

import { experimentalFeatureGroups } from '@/components/experimental-features-dialog/experimental-features';
import type {
  BooleanSetting,
  NumberSetting,
} from '@/components/experimental-features-dialog/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

function NumberFeatureRow({ feature }: Readonly<{ feature: NumberSetting }>) {
  const [value, setValue] = useAtom(feature.atom);

  const [draft, setDraft] = useState(
    () => `${Number.parseInt(value, 10) || ''}`,
  );

  const handleChange = (raw: string) => {
    setDraft(raw);
    if (/^\d+$/.test(raw) && Number(raw) > 0) {
      setValue(`${raw}m`);
    }
  };

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
              <NumberFeatureRow key={feature.feature} feature={feature} />
            ),
          )}
        </div>
      ))}
    </div>
  );
}
