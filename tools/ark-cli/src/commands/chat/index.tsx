import {Command} from 'commander';
import {render} from 'ink';
import ChatUI from '../../components/ChatUI.js';
import {ArkApiProxy} from '../../lib/arkApiProxy.js';
import type {ArkConfig} from '../../lib/config.js';
import output from '../../lib/output.js';

export function createChatCommand(config: ArkConfig): Command {
  const chatCommand = new Command('chat');
  chatCommand
    .description('Start an interactive chat session with ARK agents or models')
    .argument(
      '[target]',
      'Target to connect to (e.g., agent/sample-agent, model/default)'
    )
    .action(async (targetArg) => {
      // Direct target argument (e.g., "agent/sample-agent")
      const initialTargetId: string | undefined = targetArg;

      // Config is passed from main

      try {
        const proxy = new ArkApiProxy(
          undefined,
          config.services?.reusePortForwards ?? false
        );
        const arkApiClient = await proxy.start();

        render(
          <ChatUI
            initialTargetId={initialTargetId}
            arkApiClient={arkApiClient}
            arkApiProxy={proxy}
            config={config}
          />
        );
      } catch (error) {
        // Handle proxy startup failure or other errors
        output.error(
          error instanceof Error ? error.message : 'ARK API connection failed'
        );
        process.exit(1);
      }
    });

  return chatCommand;
}
