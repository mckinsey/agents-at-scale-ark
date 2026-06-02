import type { UseFormReturn } from 'react-hook-form';

import { AccountTree, Add, ArrowForward, Trash, Warning } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { IconShell } from '@/components/ui/icon-shell';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { components } from '@/lib/api/generated/types';
import type { TeamMember } from '@/lib/services';
import { cn } from '@/lib/utils';

import type { TeamFormValues } from '../use-team-form';

type GraphEdge = components['schemas']['GraphEdge'];

interface GraphSectionProps {
  form: UseFormReturn<TeamFormValues>;
  selectedMembers: TeamMember[];
  graphEdges: GraphEdge[];
  unavailableMembers: TeamMember[];
  onGraphEdgesChange: (edges: GraphEdge[]) => void;
  disabled?: boolean;
}

export function GraphSection({
  form,
  selectedMembers,
  graphEdges,
  unavailableMembers,
  onGraphEdgesChange,
  disabled,
}: Readonly<GraphSectionProps>) {
  const selectedStrategy = form.watch('strategy');

  if (selectedStrategy !== 'selector') {
    return null;
  }

  const addGraphEdge = () => {
    onGraphEdgesChange([...graphEdges, { from: '', to: '' }]);
  };

  const updateGraphEdge = (
    index: number,
    field: 'from' | 'to',
    value: string,
  ) => {
    const newEdges = [...graphEdges];
    newEdges[index] = { ...newEdges[index], [field]: value };
    onGraphEdgesChange(newEdges);
  };

  const removeGraphEdge = (index: number) => {
    onGraphEdgesChange(graphEdges.filter((_, i) => i !== index));
  };

  const agentsWithNoOutgoing = selectedStrategy === 'selector' && graphEdges.length > 0
    ? selectedMembers
        .filter(m => m.type === 'agent')
        .filter(m => !graphEdges.some(e => e.from === m.name))
    : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconShell size="sm" variant="secondary">
            <AccountTree />
          </IconShell>
          <h3 className="text-fg-secondary text-xs font-semibold tracking-wide uppercase">
            Graph Edges
          </h3>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addGraphEdge}
          disabled={disabled}>
          <IconShell size="sm" variant="secondary">
            <Add />
          </IconShell>
          Add Edge
        </Button>
      </div>

      {agentsWithNoOutgoing.length > 0 && (
        <div className="flex items-start gap-1">
          <IconShell
            size="sm"
            className="text-status-warning shrink-0 opacity-100">
            <Warning />
          </IconShell>
          <span className="text-fg-secondary text-sm leading-5">
            The following agents have no outgoing edges and will end graph
            execution: {agentsWithNoOutgoing.map(m => m.name).join(', ')}
          </span>
        </div>
      )}

      <ScrollArea className="border-stroke-tertiary border [&_[data-slot=scroll-area-viewport]]:max-h-48">
        <div className="space-y-2 p-2">
        {graphEdges.length === 0 ? (
          <div className="text-fg-tertiary py-2 text-center text-sm">
            No edges defined. Click &quot;Add Edge&quot; to create graph
            connections.
          </div>
        ) : (
          <div className="space-y-2">
            {graphEdges.map((edge, index) => {
              const isFromUnavailable = unavailableMembers.some(
                member => member.name === edge.from,
              );
              const isToUnavailable = unavailableMembers.some(
                member => member.name === edge.to,
              );
              return (
                <div
                  key={index}
                  className="hover:bg-stateslayer-overlay-hover flex items-center gap-2 p-2">
                  <Select
                    value={edge.from || ''}
                    onValueChange={(value) =>
                      updateGraphEdge(index, 'from', value as string)
                    }
                    disabled={disabled}>
                    <SelectTrigger
                      className={cn(
                        'flex-1',
                        isFromUnavailable && 'border-stroke-status-error',
                      )}>
                      <SelectValue placeholder="From" />
                    </SelectTrigger>
                    <SelectContent>
                      {isFromUnavailable && (
                        <SelectItem key={edge.from} value={edge.from}>
                          {edge.from} (Unavailable)
                        </SelectItem>
                      )}
                      {selectedMembers
                        .filter(m => m.type === 'agent')
                        .map(member => (
                          <SelectItem
                            key={member.name}
                            value={member.name}>
                            {member.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <span className="text-fg-tertiary">
                    <IconShell size="sm" variant="secondary">
                      <ArrowForward />
                    </IconShell>
                  </span>
                  <Select
                    value={edge.to}
                    onValueChange={(value) => updateGraphEdge(index, 'to', value as string)}
                    disabled={disabled}>
                    <SelectTrigger
                      className={cn(
                        'flex-1',
                        isToUnavailable && 'border-stroke-status-error',
                      )}>
                      <SelectValue placeholder="To" />
                    </SelectTrigger>
                    <SelectContent>
                      {isToUnavailable && (
                        <SelectItem key={edge.to} value={edge.to}>
                          {edge.to} (Unavailable)
                        </SelectItem>
                      )}
                      {selectedMembers
                        .filter(m => m.type === 'agent')
                        .map(member => (
                          <SelectItem key={member.name} value={member.name}>
                            {member.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeGraphEdge(index)}
                    disabled={disabled}
                    aria-label="Remove edge">
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
      </ScrollArea>

      <p className="text-fg-tertiary text-xs">
        Define graph constraints to limit AI selection to valid transitions.
      </p>

    </div>
  );
}
