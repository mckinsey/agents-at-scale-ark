import { Bot, Users, Wrench } from 'lucide-react';
import type { ParticipantType } from '@/lib/services/conversations';

interface GetParticipantIconOptions {
  /**
   * Icon size variant. Defaults to '4'.
   */
  size?: '4' | '5';
  /**
   * Participant name for fallback type detection.
   * Used when participantType is undefined but name contains type hints.
   */
  name?: string;
}

/**
 * Returns the appropriate Lucide icon component for a participant type.
 *
 * @param participantType - The type of participant (agent, team, or tool)
 * @param options - Optional configuration for icon size and name-based fallback
 * @returns A Lucide icon component (Bot, Users, or Wrench)
 *
 * @example
 * ```tsx
 * // Basic usage
 * const Icon = getParticipantIcon('agent');
 * <Icon className="size-4" />
 *
 * // With size variant
 * const Icon = getParticipantIcon('team', { size: '5' });
 *
 * // With name fallback
 * const Icon = getParticipantIcon(undefined, { name: 'my-team' });
 * ```
 */
export function getParticipantIcon(
  participantType?: ParticipantType,
  options?: GetParticipantIconOptions
) {
  const { size = '4', name } = options ?? {};
  const className = `size-${size}`;

  // Primary type-based check
  if (participantType === 'team') return <Users className={className} />;
  if (participantType === 'tool') return <Wrench className={className} />;
  if (participantType === 'agent') return <Bot className={className} />;

  // Fallback to name-based detection (if name provided and type is undefined)
  if (name) {
    if (name.includes('team')) return <Users className={className} />;
    if (name.includes('tool')) return <Wrench className={className} />;
  }

  // Default fallback
  return <Bot className={className} />;
}
