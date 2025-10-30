import type { Agent } from '@/lib/services';

export type AgentPhase = 'ready' | 'pending' | 'error' | 'unknown';

interface AgentPhaseBadgeProps {
  readonly agent: Agent;
  readonly className?: string;
}

// Phase configuration mapping
const PHASE_CONFIG = {
  ready: {
    text: 'Ready',
    className: 'bg-green-100 text-green-800',
  },
  pending: {
    text: 'Pending',
    className: 'bg-yellow-100 text-yellow-800',
  },
  error: {
    text: 'Error',
    className: 'bg-red-100 text-red-800',
  },
  unknown: {
    text: 'Unknown',
    className: 'bg-gray-100 text-gray-800',
  },
} as const;

/**
 * Utility function to extract agent phase from status object
 */
export function getAgentPhase(agent: Agent): AgentPhase {
  if (
    !agent.status ||
    typeof agent.status !== 'object' ||
    !('phase' in agent.status)
  ) {
    return 'unknown';
  }

  const phase = String(agent.status.phase).toLowerCase();

  if (phase === 'ready' || phase === 'pending' || phase === 'error') {
    return phase as AgentPhase;
  }

  return 'unknown';
}

/**
 * AgentPhaseBadge component renders the agent's current phase with appropriate styling
 */
export function AgentPhaseBadge({
  agent,
  className = '',
}: AgentPhaseBadgeProps) {
  const phase = getAgentPhase(agent);
  const config = PHASE_CONFIG[phase];

  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${config.className} ${className}`}>
      {config.text}
    </span>
  );
}
