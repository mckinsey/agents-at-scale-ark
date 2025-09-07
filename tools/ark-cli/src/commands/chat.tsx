import { Command } from 'commander';
import { render } from 'ink';
import * as React from 'react';
import ChatUI from '../components/ChatUI.js';

export function createChatCommand(): Command {
  const chatCommand = new Command('chat');
  chatCommand
    .description('Start an interactive chat session with ARK agents or models')
    .option('-a, --agent <name>', 'Connect directly to a specific agent')
    .option('-m, --model <name>', 'Connect directly to a specific model')
    .action((options) => {
      // TODO: Pass initial target from options to ChatUI
      render(<ChatUI />);
    });

  return chatCommand;
}