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
        // Initialize proxy first
        const proxy = new ArkApiProxy();
        const arkApiClient = await proxy.start();

        // Check if any models are configured before starting ChatUI
        try {
          const models = await arkApiClient.getModels();
          if (models.length === 0) {
            output.error('No models configured. Please configure at least one model before using ark chat.');
            output.info('Run "ark install" to set up a default model, or configure models manually.');
            proxy.stop();
            process.exit(1);
          }
        } catch (modelError) {
          output.error('Failed to check model configuration. Please ensure ark-api is running and models are configured.');
          output.info('Run "ark install" to set up a default model.');
          proxy.stop();
          process.exit(1);
        }

        // Only render ChatUI if models are available
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
        if (error instanceof Error && error.message.includes('port forward failed')) {
          output.error('ARK API connection failed. Please ensure ark-api is running.');
          output.info('Run "ark status" to check the status of ARK services.');
        } else if (error instanceof Error && error.message.includes('No models configured')) {
          output.error('No models configured. Please configure at least one model before using ark chat.');
          output.info('Run "ark install" to set up a default model, or configure models manually.');
        } else {
          output.error(
            error instanceof Error ? error.message : 'ARK API connection failed'
          );
        }
        process.exit(1);
      }
    });

  return chatCommand;
}
