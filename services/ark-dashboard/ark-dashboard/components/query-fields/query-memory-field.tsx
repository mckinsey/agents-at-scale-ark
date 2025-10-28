'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface MemoryOption {
  name: string;
}

interface QueryMemoryFieldProps {
  mode: 'new' | 'view';
  value: { name: string } | null | undefined;
  onChange?: (memory: { name: string } | undefined) => void;
  label: string;
  availableMemories: MemoryOption[];
  loading?: boolean;
}

// Reusable styles for table field headings
const FIELD_HEADING_STYLES =
  'px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 w-1/3 text-left';

export function QueryMemoryField({
  mode,
  value,
  onChange,
  label,
  availableMemories,
  loading = false,
}: QueryMemoryFieldProps) {
  if (mode === 'view') {
    return (
      <tr className="border-b border-gray-100 dark:border-gray-800">
        <td className={FIELD_HEADING_STYLES}>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger className="cursor-help text-left" tabIndex={-1}>
                {label}
              </TooltipTrigger>
              <TooltipContent>
                <p>Optional configuration for conversation memory</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </td>
        <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
          {value ? value.name : '—'}
        </td>
      </tr>
    );
  }

  // New/edit mode
  return (
    <tr className="border-b border-gray-100 dark:border-gray-800">
      <td className={FIELD_HEADING_STYLES}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger className="cursor-help text-left" tabIndex={-1}>
              {label}
            </TooltipTrigger>
            <TooltipContent>
              <p>Optional configuration for conversation memory</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </td>
      <td className="px-3 py-2">
        <Select
          value={value?.name || '__none__'}
          onValueChange={selectedValue => {
            onChange?.(
              selectedValue === '__none__'
                ? undefined
                : { name: selectedValue },
            );
          }}
          disabled={loading}>
          <SelectTrigger className="h-9 w-full">
            <SelectValue
              className="text-sm"
              placeholder={loading ? 'Loading...' : 'Select memory (optional)'}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">
              <span className="text-muted-foreground">(None)</span>
            </SelectItem>
            {availableMemories.map(memory => (
              <SelectItem key={memory.name} value={memory.name}>
                {memory.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
    </tr>
  );
}
