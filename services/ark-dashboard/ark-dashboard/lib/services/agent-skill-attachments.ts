/**
 * Mock service mapping each agent to the skills it has attached.
 * Backed by localStorage; in the real implementation this lives on
 * Agent.spec.skills (per the agent-skills proposal).
 */

const STORAGE_KEY = 'ark-dashboard:agent-skill-attachments:default';

export type AgentSkillMap = Record<string, string[]>;

function read(): AgentSkillMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as AgentSkillMap;
  } catch {
    return {};
  }
}

function write(map: AgentSkillMap): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Quota exceeded — silently drop.
  }
}

export const agentSkillAttachmentsService = {
  async getForAgent(agentName: string): Promise<string[]> {
    return read()[agentName] ?? [];
  },

  async setForAgent(agentName: string, skillNames: string[]): Promise<void> {
    const map = read();
    if (skillNames.length === 0) {
      delete map[agentName];
    } else {
      map[agentName] = [...new Set(skillNames)];
    }
    write(map);
  },

  async attach(agentName: string, skillName: string): Promise<void> {
    const map = read();
    const current = map[agentName] ?? [];
    if (!current.includes(skillName)) {
      map[agentName] = [...current, skillName];
      write(map);
    }
  },

  async detach(agentName: string, skillName: string): Promise<void> {
    const map = read();
    const current = map[agentName] ?? [];
    const next = current.filter(n => n !== skillName);
    if (next.length === 0) {
      delete map[agentName];
    } else {
      map[agentName] = next;
    }
    write(map);
  },

  /**
   * Removes all attachments referencing a given skill across every agent.
   * Used after a skill is deleted.
   */
  async forgetSkill(skillName: string): Promise<void> {
    const map = read();
    let changed = false;
    for (const agent of Object.keys(map)) {
      const next = (map[agent] ?? []).filter(n => n !== skillName);
      if (next.length !== (map[agent]?.length ?? 0)) {
        changed = true;
        if (next.length === 0) delete map[agent];
        else map[agent] = next;
      }
    }
    if (changed) write(map);
  },
};
