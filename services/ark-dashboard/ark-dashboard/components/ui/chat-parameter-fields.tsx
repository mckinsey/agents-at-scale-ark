'use client';

import { useState } from 'react';

import { Add, ChevronDown, Info, Trash } from '@/components/icons';
import { NamespacedLink } from '@/components/namespaced-link';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { Input } from '@/components/ui/input';
import {
  GHOST_TRIGGER,
  Select,
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type {
  ParameterRow,
  TeamAgentParameters,
} from '@/lib/hooks/use-agent-query-parameters';

interface BaseProps {
  readonly rows: ParameterRow[];
  readonly onAddRow: () => void;
  readonly onChangeName: (id: string, name: string) => void;
  readonly onChangeValue: (id: string, value: string) => void;
  readonly onRemoveRow: (id: string) => void;
  readonly canAddRow: boolean;
  readonly disabled?: boolean;
}

type Props = BaseProps &
  (
    | { readonly variant: 'agent'; readonly availableParameters: string[] }
    | {
        readonly variant: 'team';
        readonly teamAgents: TeamAgentParameters[];
        readonly onChangeAgent: (id: string, agent: string) => void;
      }
  );

const VARIABLES_TOOLTIP = (
  <>
    These variables were defined at the agent prompt level. To change these
    variables or add new ones, please go to{' '}
    <NamespacedLink
      href="/agents"
      className="font-medium underline underline-offset-2 hover:opacity-80">
      Agent Studio
    </NamespacedLink>
    .
  </>
);

export function ChatParameterFields(props: Props) {
  const {
    rows,
    onAddRow,
    onChangeName,
    onChangeValue,
    onRemoveRow,
    canAddRow,
    disabled,
  } = props;
  const [expanded, setExpanded] = useState(true);

  const count =
    props.variant === 'team'
      ? props.teamAgents.reduce(
          (sum, agent) => sum + agent.parameters.length,
          0,
        )
      : props.availableParameters.length;

  if (count === 0) return null;

  return (
    <div className="border-stroke-divider flex flex-col gap-3 border-b pb-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-fg-secondary text-sm">
            {count} variable{count > 1 ? 's' : ''} available
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="About variables"
                className="text-fg-secondary hover:text-fg-primary">
                <IconShell size="sm" variant="secondary">
                  <Info />
                </IconShell>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" align="start">
              {VARIABLES_TOOLTIP}
            </TooltipContent>
          </Tooltip>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          aria-label={expanded ? 'Collapse variables' : 'Expand variables'}
          aria-expanded={expanded}
          className="text-fg-secondary hover:text-fg-primary">
          <IconShell size="sm" variant="secondary">
            <ChevronDown className={expanded ? 'rotate-180' : ''} />
          </IconShell>
        </button>
      </div>

      {expanded && (
        <div className="flex flex-col gap-3">
          <Button
            type="button"
            size="icon-xs"
            variant="outline"
            onClick={onAddRow}
            disabled={!canAddRow || disabled}
            aria-label="Add variable">
            <IconShell size="sm">
              <Add />
            </IconShell>
          </Button>

          {rows.length > 0 && (
            <div className="flex max-h-[136px] flex-col gap-3 overflow-y-auto">
              {rows.map(row => {
                // For teams the variable options depend on the selected agent;
                // for agents every available parameter is selectable.
                const agentParams =
                  props.variant === 'team'
                    ? props.teamAgents.find(
                        entry => entry.name === row.agent,
                      )?.parameters || []
                    : props.availableParameters;

                // Within a row's agent (or globally for agents), a variable
                // already chosen by another row is not offered again.
                const usedByOthers = new Set(
                  rows
                    .filter(
                      other =>
                        other.id !== row.id &&
                        other.name &&
                        (props.variant !== 'team' ||
                          other.agent === row.agent),
                    )
                    .map(other => other.name),
                );
                const options = agentParams.filter(
                  name => name === row.name || !usedByOthers.has(name),
                );

                return (
                  <div key={row.id} className="flex items-center gap-3">
                    {props.variant === 'team' && (
                      <Select
                        value={row.agent || null}
                        onValueChange={value =>
                          props.onChangeAgent(
                            row.id,
                            typeof value === 'string' ? value : '',
                          )
                        }
                        disabled={disabled}>
                        <SelectTrigger
                          className={`${GHOST_TRIGGER} w-36 shrink-0`}
                          aria-label="Choose agent">
                          <SelectValue placeholder="Choose agent" />
                        </SelectTrigger>
                        <SelectContent>
                          {props.teamAgents.map(agent => {
                            // An agent can be reused for its other variables;
                            // it is only disabled once every one of its
                            // variables is already in use by other rows.
                            const usedForAgent = new Set(
                              rows
                                .filter(
                                  other =>
                                    other.id !== row.id &&
                                    other.agent === agent.name &&
                                    other.name,
                                )
                                .map(other => other.name),
                            );
                            const exhausted =
                              agent.name !== row.agent &&
                              agent.parameters.every(param =>
                                usedForAgent.has(param),
                              );
                            // SelectItem must stay a direct child for Base UI
                            // item registration, so the "already used" hint is a
                            // native title rather than a wrapping Tooltip.
                            return (
                              <SelectItem
                                key={agent.name}
                                value={agent.name}
                                disabled={exhausted}
                                title={
                                  exhausted
                                    ? 'You cannot select the same agent twice'
                                    : undefined
                                }>
                                <SelectItemText>{agent.name}</SelectItemText>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    )}

                    <Select
                      value={row.name || null}
                      onValueChange={value =>
                        onChangeName(
                          row.id,
                          typeof value === 'string' ? value : '',
                        )
                      }
                      disabled={
                        disabled ||
                        (props.variant === 'team' && !row.agent)
                      }>
                      <SelectTrigger
                        className={`${GHOST_TRIGGER} w-36 shrink-0`}
                        aria-label="Choose variable">
                        <SelectValue placeholder="Choose variable" />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map(name => (
                          <SelectItem key={name} value={name}>
                            <SelectItemText>{name}</SelectItemText>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Input
                      variant="inline"
                      size="sm"
                      value={row.value}
                      onChange={e => onChangeValue(row.id, e.target.value)}
                      placeholder="Enter value..."
                      disabled={disabled}
                      aria-label="Variable value"
                      className="flex-1"
                    />

                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => onRemoveRow(row.id)}
                      disabled={disabled}
                      aria-label="Remove variable">
                      <IconShell size="sm" variant="secondary">
                        <Trash />
                      </IconShell>
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
