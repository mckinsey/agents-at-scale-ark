'use client';

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

const INLINE_TRIGGER_STYLES =
  'border-stroke-tertiary hover:border-stroke-secondary focus-visible:border-stroke-status-focus w-full rounded-none border-0 border-b bg-transparent px-0 py-2 text-left transition-colors focus:ring-0 focus-visible:ring-0';

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
