import {AsyncOperationConfig} from '../../components/AsyncOperation.js';
import {ArkApiClient} from '../../lib/arkApiClient.js';
import {ChatClient, QueryTarget} from '../../lib/chatClient.js';

export interface ConnectingToArkParams {
  arkApiClient: ArkApiClient;
  initialTargetId?: string;
  onSuccess: (data: {
    client: ChatClient;
    targets: QueryTarget[];
    selectedTarget: QueryTarget | null;
    selectedIndex: number;
  }) => void;
  onQuit: () => void;
}

export function createConnectingToArkOperation(
  params: ConnectingToArkParams
): AsyncOperationConfig {
  return {
    message: 'Connecting to Ark...',
    operation: async (_signal) => {
      const client = new ChatClient(params.arkApiClient);
      const targets = await client.getQueryTargets();

      let selectedTarget: QueryTarget | null = null;
      let selectedIndex = 0;

      if (params.initialTargetId) {
        const matchedTarget = targets.find(
          (t) => t.id === params.initialTargetId
        );
        const matchedIndex = targets.findIndex(
          (t) => t.id === params.initialTargetId
        );
        if (matchedTarget) {
          selectedTarget = matchedTarget;
          selectedIndex = matchedIndex >= 0 ? matchedIndex : 0;
        } else {
          throw new Error(
            `Target "${params.initialTargetId}" not found. Use "ark targets list" to see available targets.`
          );
        }
      } else if (targets.length > 0) {
        const agents = targets.filter((t) => t.type === 'agent');
        const models = targets.filter((t) => t.type === 'model');
        const tools = targets.filter((t) => t.type === 'tool');

        if (agents.length > 0) {
          selectedTarget = agents[0];
          selectedIndex = targets.findIndex((t) => t.id === agents[0].id);
        } else if (models.length > 0) {
          selectedTarget = models[0];
          selectedIndex = targets.findIndex((t) => t.id === models[0].id);
        } else if (tools.length > 0) {
          selectedTarget = tools[0];
          selectedIndex = targets.findIndex((t) => t.id === tools[0].id);
        } else {
          throw new Error('No targets available');
        }
      } else {
        throw new Error('No agents, models, or tools available');
      }

      params.onSuccess({
        client,
        targets,
        selectedTarget,
        selectedIndex,
      });
    },
    hideOnSuccess: true,
    errorOptions: [
      {label: 'Try again', onSelect: () => {}},
      {
        label: 'Check status',
        onSelect: () => {
          console.log('Status command not yet implemented');
        },
      },
      {label: 'Quit', onSelect: params.onQuit},
    ],
  };
}
