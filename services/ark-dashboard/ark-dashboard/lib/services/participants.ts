import { agentsService } from './agents';
import { teamsService } from './teams';
import { toolsService } from './tools';

export interface Participant {
  name: string;
  type: 'agent' | 'team' | 'tool';
  description?: string | null;
}

export const participantsService = {
  async getAll(): Promise<Participant[]> {
    const [agents, teams, tools] = await Promise.all([
      agentsService.getAll().catch(() => []),
      teamsService.getAll().catch(() => []),
      toolsService.getAll().catch(() => []),
    ]);

    const participants: Participant[] = [
      ...agents.map(agent => ({
        name: agent.name,
        type: 'agent' as const,
        description: agent.description,
      })),
      ...teams.map(team => ({
        name: team.name,
        type: 'team' as const,
        description: team.description,
      })),
      ...tools.map(tool => ({
        name: tool.name,
        type: 'tool' as const,
        description: tool.description,
      })),
    ];

    return participants;
  },
};
