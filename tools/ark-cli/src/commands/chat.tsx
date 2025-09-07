import { Command } from 'commander';
import { render } from 'ink';
import * as React from 'react';
import ChatUI from '../components/ChatUI.js';

export function createChatCommand(): Command {
  const chatCommand = new Command('chat');
  chatCommand
    .description('Start an interactive chat session with ARK agents or models')
    .argument('[target]', 'Target to connect to (e.g., agent/sample-agent, model/default)')
    .option('-a, --agent <name>', 'Connect directly to a specific agent')
    .option('-m, --model <name>', 'Connect directly to a specific model')
    .action((targetArg, options) => {
      // Determine initial target from argument or options
      let initialTargetId: string | undefined;
      
      if (targetArg) {
        // Direct target argument (e.g., "agent/sample-agent")
        initialTargetId = targetArg;
      } else if (options.agent) {
        // Agent option
        initialTargetId = `agent/${options.agent}`;
      } else if (options.model) {
        // Model option
        initialTargetId = `model/${options.model}`;
      }
      
      render(<ChatUI initialTargetId={initialTargetId} />);
    });

  return chatCommand;
}