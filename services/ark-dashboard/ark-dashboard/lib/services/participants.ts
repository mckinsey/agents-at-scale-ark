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
    const results = await Promise.allSettled([
      agentsService.getAll(),
      teamsService.getAll(),
      toolsService.getAll(),
    ]);

    const agents = results[0].status === 'fulfilled' ? results[0].value : [];
    const teams = results[1].status === 'fulfilled' ? results[1].value : [];
    const tools = results[2].status === 'fulfilled' ? results[2].value : [];

    if (results.every(r => r.status === 'rejected')) {
      throw new Error('Failed to load participants');
    }

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
