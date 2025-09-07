import { Command } from 'commander';
import { render } from 'ink';
import * as React from 'react';
import DashboardCLI from '../components/DashboardCLI.js';

export function createDashboardCommand(): Command {
  const dashboardCommand = new Command('dashboard');
  dashboardCommand
    .description('Launch the ARK dashboard')
    .action(() => {
      render(<DashboardCLI />);
    });

  return dashboardCommand;
}