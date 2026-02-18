import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type ChatType,
  openFloatingChat,
  toggleFloatingChat,
} from '@/lib/chat-events';

describe('chat-events', () => {
  let dispatchEventSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');
  });

  afterEach(() => {
    dispatchEventSpy.mockRestore();
  });

  describe('openFloatingChat', () => {
    it('should dispatch event with name and type', () => {
      const name = 'test-agent';
      const type: ChatType = 'agent';

      openFloatingChat(name, type);

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'open-floating-chat',
          detail: { name, type, strategy: undefined, graphEdges: undefined },
        }),
      );
    });

    it('should dispatch event with strategy when provided', () => {
      const name = 'test-team';
      const type: ChatType = 'team';
      const strategy = 'round-robin';

      openFloatingChat(name, type, strategy);

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'open-floating-chat',
          detail: { name, type, strategy, graphEdges: undefined },
        }),
      );
    });

    it('should dispatch event without strategy for agent', () => {
      const name = 'test-agent';
      const type: ChatType = 'agent';

      openFloatingChat(name, type);

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'open-floating-chat',
          detail: { name, type, strategy: undefined, graphEdges: undefined },
        }),
      );
    });

    it('should dispatch event with graphEdges when provided', () => {
      const name = 'test-team';
      const type: ChatType = 'team';
      const strategy = 'graph';
      const graphEdges = [
        { from: 'agent-a', to: 'agent-b' },
        { from: 'agent-b', to: 'agent-c' },
      ];

      openFloatingChat(name, type, strategy, graphEdges);

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'open-floating-chat',
          detail: { name, type, strategy, graphEdges },
        }),
      );
    });
  });

  describe('toggleFloatingChat', () => {
    it('should dispatch event with name and type', () => {
      const name = 'test-model';
      const type: ChatType = 'model';

      toggleFloatingChat(name, type);

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'toggle-floating-chat',
          detail: { name, type, strategy: undefined, graphEdges: undefined },
        }),
      );
    });

    it('should dispatch event with strategy when provided', () => {
      const name = 'test-team';
      const type: ChatType = 'team';
      const strategy = 'selector';

      toggleFloatingChat(name, type, strategy);

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'toggle-floating-chat',
          detail: { name, type, strategy, graphEdges: undefined },
        }),
      );
    });

    it('should dispatch event with round-robin strategy', () => {
      const name = 'round-robin-team';
      const type: ChatType = 'team';
      const strategy = 'round-robin';

      toggleFloatingChat(name, type, strategy);

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'toggle-floating-chat',
          detail: {
            name,
            type,
            strategy: 'round-robin',
            graphEdges: undefined,
          },
        }),
      );
    });

    it('should dispatch event with graphEdges when provided', () => {
      const name = 'graph-team';
      const type: ChatType = 'team';
      const strategy = 'graph';
      const graphEdges = [{ from: 'a', to: 'b' }];

      toggleFloatingChat(name, type, strategy, graphEdges);

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'toggle-floating-chat',
          detail: { name, type, strategy, graphEdges },
        }),
      );
    });
  });
});
