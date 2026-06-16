import { AlertCircle, Network, Trash2 } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
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

  const usedFromAgents = new Set(
    graphEdges.filter(e => e.from).map(e => e.from),
  );

  const agentsWithNoOutgoing = selectedStrategy === 'selector' && graphEdges.length > 0
    ? selectedMembers
        .filter(m => m.type === 'agent')
        .filter(m => !graphEdges.some(e => e.from === m.name))
    : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Network className="text-muted-foreground h-4 w-4" />
          <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Graph Edges
          </h3>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addGraphEdge}
          disabled={disabled}>
          Add Edge
        </Button>
      </div>

      {agentsWithNoOutgoing.length > 0 && (
        <Alert variant="warning">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            The following agents have no outgoing edges and will end graph execution:{' '}
            {agentsWithNoOutgoing.map(m => m.name).join(', ')}
          </AlertDescription>
        </Alert>
      )}

      <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-2">
        {graphEdges.length === 0 ? (
          <div className="text-muted-foreground py-2 text-center text-sm">
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
                  className="hover:bg-muted/50 flex items-center gap-2 rounded-md p-2">
                  <Select
                    value={edge.from || ''}
                    onValueChange={value =>
                      updateGraphEdge(index, 'from', value)
                    }
                    disabled={disabled}>
                    <SelectTrigger
                      className={cn(
                        'flex-1',
                        isFromUnavailable && 'border-red-500',
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
                  <span className="text-muted-foreground">→</span>
                  <Select
                    value={edge.to}
                    onValueChange={value => updateGraphEdge(index, 'to', value)}
                    disabled={disabled}>
                    <SelectTrigger
                      className={cn(
                        'flex-1',
                        isToUnavailable && 'border-red-500',
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
                    size="icon"
                    className="h-8 w-8 hover:text-red-500"
                    onClick={() => removeGraphEdge(index)}
                    disabled={disabled}
                    aria-label="Remove edge">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        Define graph constraints to limit AI selection to valid transitions.
      </p>

    </div>
  );
}
