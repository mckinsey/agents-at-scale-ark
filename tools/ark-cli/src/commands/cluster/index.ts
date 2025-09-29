import {Command} from 'commander';
import type {ArkConfig} from '../../lib/config.js';

import {createGetCommand} from './get.js';

export function createClusterCommand(_: ArkConfig): Command {
  const cluster = new Command('cluster');
  cluster.description('Cluster management commands');

  cluster.addCommand(createGetCommand());

  return cluster;
}
