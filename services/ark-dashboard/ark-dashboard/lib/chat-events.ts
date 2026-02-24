import type { GraphEdge } from '@/lib/types/chat-message';

export type ChatType = 'model' | 'team' | 'agent';

export const openFloatingChat = (
  name: string,
  type: ChatType,
  strategy?: string,
  graphEdges?: GraphEdge[],
) => {
  window.dispatchEvent(
    new CustomEvent('open-floating-chat', {
      detail: { name, type, strategy, graphEdges },
    }),
  );
};

export const toggleFloatingChat = (
  name: string,
  type: ChatType,
  strategy?: string,
  graphEdges?: GraphEdge[],
) => {
  window.dispatchEvent(
    new CustomEvent('toggle-floating-chat', {
      detail: { name, type, strategy, graphEdges },
    }),
  );
};
