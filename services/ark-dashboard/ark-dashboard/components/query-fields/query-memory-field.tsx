'use client';

import { INLINE_TRIGGER_STYLES } from '@/components/query-fields/inline-trigger-styles';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface MemoryOption {
  name: string;
}

interface QueryMemoryFieldProps {
  value: { name: string } | null | undefined;
  onChange?: (memory: { name: string } | undefined) => void;
  availableMemories: MemoryOption[];
  loading?: boolean;
}

export function QueryMemoryField({
  value,
  onChange,
  availableMemories,
  loading = false,
}: QueryMemoryFieldProps) {
  return (
    <Select
      value={value?.name || '__none__'}
      onValueChange={selectedValue => {
        const val = selectedValue as string;
        onChange?.(val === '__none__' ? undefined : { name: val });
      }}
      disabled={loading}>
      <SelectTrigger className={INLINE_TRIGGER_STYLES}>
        <SelectValue
          placeholder={loading ? 'Loading...' : 'Select memory (optional)'}
        />
      </SelectTrigger>
      <SelectContent className="bg-fill-onsurface-ui-2">
        <SelectItem value="__none__">
          <span className="text-fg-tertiary">(None)</span>
        </SelectItem>
        {availableMemories.map(memory => (
          <SelectItem key={memory.name} value={memory.name}>
            {memory.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
