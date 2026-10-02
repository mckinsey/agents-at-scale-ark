'use client';

import { useAtom } from 'jotai';
import { useEffect, useState } from 'react';

import { experimentalFeatureGroups } from '@/components/experimental-features-dialog/experimental-features';
import type {
  BooleanSetting,
  NumberSetting,
} from '@/components/experimental-features-dialog/types';
import { Badge } from '@/components/ui/badge';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TruncatedTooltip } from '@/components/ui/truncated-tooltip';
import {
  formatQueryTimeoutMinutes,
  validateQueryTimeoutMinutes,
} from '@/lib/utils/query-timeout';

const COL = {
  name: 'w-[240px]',
  category: 'w-[140px]',
  control: 'w-[160px]',
};

type FeatureRowProps = Readonly<{
  feature: BooleanSetting | NumberSetting;
  category?: string;
  control: React.ReactNode;
}>;

function FeatureRow({ feature, category, control }: FeatureRowProps) {
  return (
    <TableRow>
      <TableCell className={COL.name}>
        <TruncatedTooltip label={feature.feature}>
          <span className="text-fg-primary block w-full truncate">
            {feature.feature}
          </span>
        </TruncatedTooltip>
      </TableCell>
      <TableCell className="max-w-0">
        <TruncatedTooltip label={feature.description}>
          <span className="text-fg-secondary block w-full truncate">
            {feature.description}
          </span>
        </TruncatedTooltip>
      </TableCell>
      <TableCell className={COL.category}>
        {category && <Badge variant="alternative">{category}</Badge>}
      </TableCell>
      <TableCell className={COL.control}>{control}</TableCell>
    </TableRow>
  );
}

function BooleanFeatureRow({
  feature,
  category,
}: Readonly<{ feature: BooleanSetting; category?: string }>) {
  const [value, setValue] = useAtom(feature.atom);

  return (
    <FeatureRow
      feature={feature}
      category={category}
      control={
        <Switch
          checked={value}
          onCheckedChange={setValue}
          aria-label={feature.feature}
        />
      }
    />
  );
}

function NumberFeatureRow({
  feature,
  category,
}: Readonly<{ feature: NumberSetting; category?: string }>) {
  const [value, setValue] = useAtom(feature.atom);

  const [draft, setDraft] = useState(() => formatQueryTimeoutMinutes(value));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(previous =>
      Number.parseInt(previous, 10) === Number.parseInt(value, 10)
        ? previous
        : formatQueryTimeoutMinutes(value),
    );
  }, [value]);

  const handleChange = (raw: string) => {
    setDraft(raw);
    const validation = validateQueryTimeoutMinutes(raw);
    setError(validation);
    if (!validation) {
      setValue(`${raw.trim()}m`);
    }
  };

  return (
    <FeatureRow
      feature={feature}
      category={category}
      control={
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              variant="inline"
              value={draft}
              onChange={e => handleChange(e.target.value)}
              aria-label={feature.feature}
              aria-invalid={!!error}
              className="w-[64px]"
            />
            <span className="text-fg-tertiary paragraph-regular-primary">
              min
            </span>
          </div>
          <FieldError>{error}</FieldError>
        </div>
      }
    />
  );
}

export function ExperimentalFeaturesSettings() {
  const rows = experimentalFeatureGroups.flatMap(group =>
    group.features.map(feature => ({ feature, category: group.groupLabel })),
  );

  return (
    <Table
      aria-label="Experimental features"
      className="min-w-[800px] table-fixed border-separate border-spacing-x-4 border-spacing-y-0">
      <TableHeader>
        <TableRow>
          <TableHead size="small" className={COL.name}>
            Name
          </TableHead>
          <TableHead size="small">Description</TableHead>
          <TableHead size="small" className={COL.category}>
            Category
          </TableHead>
          <TableHead size="small" className={COL.control}>
            <span className="sr-only">Enabled</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(({ feature, category }) =>
          feature.type === 'boolean' ? (
            <BooleanFeatureRow
              key={feature.feature}
              feature={feature}
              category={category}
            />
          ) : (
            <NumberFeatureRow
              key={feature.feature}
              feature={feature}
              category={category}
            />
          ),
        )}
      </TableBody>
    </Table>
  );
}
