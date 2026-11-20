'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AgentTool, ToolApprovalConfig } from '@/lib/services';
import { parseDurationToMs } from '@/lib/utils/time';

const ON_TIMEOUT_ITEMS = [
  { value: 'reject', label: 'reject' },
  { value: 'proceed', label: 'proceed' },
];

function isInvalidTimeout(timeout: string | null | undefined): boolean {
  if (!timeout) return false;
  const ms = parseDurationToMs(timeout);
  return ms === null || ms <= 0;
}

interface ToolApprovalsSectionProps {
  readonly selectedTools: AgentTool[];
  readonly getToolApproval: (
    toolName: string,
  ) => ToolApprovalConfig | undefined;
  readonly getEffectiveToolApproval: (
    toolName: string,
  ) => ToolApprovalConfig | undefined;
  readonly isToolApprovalEnforced: (toolName: string) => boolean;
  readonly onApprovalChange: (
    toolName: string,
    approval: ToolApprovalConfig | undefined,
  ) => void;
  readonly disabled?: boolean;
}

export function ToolApprovalsSection({
  selectedTools,
  getToolApproval,
  getEffectiveToolApproval,
  isToolApprovalEnforced,
  onApprovalChange,
  disabled = false,
}: ToolApprovalsSectionProps) {
  const tools = selectedTools.filter(
    (tool): tool is AgentTool & { name: string } => Boolean(tool.name),
  );

  if (tools.length === 0) return null;

  return (
    <FieldSet className="gap-2">
      <FieldLegend variant="label">Tool approvals</FieldLegend>
      <div className="border-stroke-divider flex flex-col gap-3 rounded-md border p-3">
        {tools.map(tool => {
          // Agent-level config is the base for any override we persist; the
          // effective config (agent unioned with the Tool CR's own approval)
          // drives what the panel shows.
          const agentApproval = getToolApproval(tool.name);
          const effective = getEffectiveToolApproval(tool.name);
          const enforced = isToolApprovalEnforced(tool.name);
          const required = effective?.required === true;
          const timeoutId = `approval-timeout-${tool.name}`;
          const onTimeoutId = `approval-on-timeout-${tool.name}`;
          const timeoutInvalid = isInvalidTimeout(effective?.timeout);

          // Persist overrides against the agent-level config, not the effective
          // one, so a Tool-gated tool does not get the Tool's values copied into
          // the agent spec. A Tool-enforced gate is never written as required
          // on the agent (the Tool already enforces it and the agent cannot
          // unset it).
          const writeOverride = (patch: Partial<ToolApprovalConfig>) =>
            onApprovalChange(tool.name, {
              ...agentApproval,
              ...(enforced ? {} : { required: true }),
              ...patch,
            });

          return (
            <div key={tool.name} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`approval-${tool.name}`}
                  checked={required}
                  disabled={disabled || enforced}
                  onCheckedChange={checked =>
                    onApprovalChange(
                      tool.name,
                      checked
                        ? { ...agentApproval, required: true }
                        : undefined,
                    )
                  }
                />
                <Label
                  htmlFor={`approval-${tool.name}`}
                  className="cursor-pointer text-sm font-normal">
                  {tool.name}
                </Label>
                {enforced && (
                  <span className="text-fg-tertiary text-xs">
                    Required by tool
                  </span>
                )}
              </div>
              {required && (
                <div className="ml-6 flex gap-3">
                  <div className="flex flex-1 flex-col gap-1">
                    <FieldLabel
                      htmlFor={timeoutId}
                      className="text-fg-tertiary text-xs">
                      Timeout
                    </FieldLabel>
                    <Input
                      id={timeoutId}
                      placeholder="e.g., 5m"
                      value={effective?.timeout ?? ''}
                      disabled={disabled}
                      aria-invalid={timeoutInvalid}
                      aria-describedby={
                        timeoutInvalid ? `${timeoutId}-error` : undefined
                      }
                      onChange={e =>
                        writeOverride({ timeout: e.target.value || undefined })
                      }
                    />
                    {timeoutInvalid && (
                      <p
                        id={`${timeoutId}-error`}
                        className="text-status-error text-xs">
                        Enter a duration like 30s, 5m, or 1h30m.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1">
                    <FieldLabel
                      htmlFor={onTimeoutId}
                      className="text-fg-tertiary text-xs">
                      On timeout
                    </FieldLabel>
                    <Select
                      items={ON_TIMEOUT_ITEMS}
                      value={effective?.onTimeout ?? undefined}
                      disabled={disabled}
                      onValueChange={(value: unknown) =>
                        writeOverride({ onTimeout: String(value) })
                      }>
                      <SelectTrigger id={onTimeoutId}>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {ON_TIMEOUT_ITEMS.map(item => (
                          <SelectItem key={item.value} value={item.value}>
                            <SelectItemText>{item.label}</SelectItemText>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </FieldSet>
  );
}
