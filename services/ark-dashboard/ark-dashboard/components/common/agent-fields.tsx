import { Label } from '@radix-ui/react-label';
import { useEffect, useState } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type Agent, agentsService } from '@/lib/services';

interface AgentFieldsProps {
  selectedAgent: string;
  setSelectedAgent: (agent: string) => void;
  namespace: string;
  open: boolean;
}

function AgentFields({
  selectedAgent,
  setSelectedAgent,
  namespace,
  open,
}: AgentFieldsProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);

  useEffect(() => {
    const fetchAgents = async () => {
      if (open) {
        setLoadingAgents(true);
        try {
          const agentList = await agentsService.getAll();
          setAgents(agentList);
        } catch (error) {
          console.error('Failed to load agents:', error);
        } finally {
          setLoadingAgents(false);
        }
      }
    };
    fetchAgents();
  }, [open, namespace]);

  return (
    <div className="grid gap-2">
      <Label htmlFor="agent">Agent</Label>
      <Select value={selectedAgent} onValueChange={setSelectedAgent}>
        <SelectTrigger id="agent">
          <SelectValue
            placeholder={
              loadingAgents ? 'Loading agents...' : 'Select agent...'
            }
          />
        </SelectTrigger>
        <SelectContent>
          {loadingAgents ? (
            <SelectItem value="loading" disabled>
              Loading agents...
            </SelectItem>
          ) : agents.length === 0 ? (
            <SelectItem value="no-agents" disabled>
              No agents available
            </SelectItem>
          ) : (
            agents.map(agent => (
              <SelectItem key={agent.id} value={agent.name}>
                {agent.name}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

export { AgentFields };
