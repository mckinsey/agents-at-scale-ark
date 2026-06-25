'use client';

import { Variable } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  readonly requiredParameters: string[];
  readonly values: Record<string, string>;
  readonly onChange: (name: string, value: string) => void;
  readonly disabled?: boolean;
}

export function ChatParameterFields({
  requiredParameters,
  values,
  onChange,
  disabled,
}: Props) {
  if (requiredParameters.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Variable className="text-muted-foreground h-4 w-4" />
        <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Parameters
        </h3>
      </div>
      <div className="space-y-2">
        {requiredParameters.map(name => (
          <div key={name} className="rounded-md border p-3">
            <Label className="text-muted-foreground text-[10px] tracking-wide uppercase">
              {name}
            </Label>
            <Input
              value={values[name] || ''}
              onChange={e => onChange(name, e.target.value)}
              placeholder="Enter value..."
              disabled={disabled}
              className="h-8 text-sm"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
