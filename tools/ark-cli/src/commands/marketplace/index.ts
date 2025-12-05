import {Command} from 'commander';
import chalk from 'chalk';
import type {ArkConfig} from '../../lib/config.js';
import {
  getMarketplaceRepoUrl,
  getMarketplaceRegistry,
} from '../../lib/config.js';
import {
  getAllMarketplaceServices,
  getAllMarketplaceAgents,
} from '../../marketplaceServices.js';
import {fetchMarketplaceManifest} from '../../lib/marketplaceFetcher.js';

function createMarketplaceCommand(_config: ArkConfig): Command {
  const repoUrl = getMarketplaceRepoUrl();
  const registry = getMarketplaceRegistry();

  const marketplace = new Command('marketplace');
  marketplace
    .description('Manage marketplace services')
    .addHelpText(
      'before',
      `
${chalk.blue('🏪 ARK Marketplace')}
Install community-contributed services from the ARK Marketplace.

Repository: ${chalk.cyan(repoUrl)}
Registry: ${chalk.cyan(registry.replace('oci://', ''))}
`
    )
    .addHelpText(
      'after',
      `
${chalk.cyan('Examples:')}
  ${chalk.yellow('ark marketplace list')}                        # List available services and agents
  ${chalk.yellow('ark install marketplace/services/phoenix')}    # Install Phoenix service
  ${chalk.yellow('ark install marketplace/agents/noah')}         # Install Noah agent
  ${chalk.yellow('ark uninstall marketplace/services/phoenix')}  # Uninstall Phoenix
`
    );

  // List command
  const list = new Command('list');
  list
    .alias('ls')
    .description('List available marketplace services and agents')
    .action(async () => {
      const services = await getAllMarketplaceServices();
      const agents = await getAllMarketplaceAgents();
      const manifest = await fetchMarketplaceManifest();

      console.log(chalk.blue('\n🏪 ARK Marketplace\n'));

      if (!manifest) {
        console.log(
          chalk.yellow('⚠️  Marketplace unavailable\n')
        );
        console.log(
          chalk.gray('Could not fetch marketplace.json from repository.\n')
        );
        console.log(
          chalk.cyan(
            `Repository: ${repoUrl}`
          )
        );
        console.log(
          chalk.cyan(
            `Registry: ${registry}`
          )
        );
        console.log();
        return;
      }

      console.log(
        chalk.dim(
          `Using marketplace.json (version: ${manifest.version})\n`
        )
      );

      if (services && Object.keys(services).length > 0) {
        console.log(chalk.bold('Services:'));
        console.log(
          chalk.gray('Install with: ark install marketplace/services/<name>\n')
        );

        for (const [key, service] of Object.entries(services)) {
          const icon = '📦';
          const serviceName = `marketplace/services/${key.padEnd(12)}`;
          const serviceDesc = service.description;
          console.log(
            `${icon} ${chalk.green(serviceName)} ${chalk.gray(serviceDesc)}`
          );
          const namespaceInfo = `namespace: ${service.namespace || 'default'}`;
          console.log(`   ${chalk.dim(namespaceInfo)}`);
          console.log();
        }
      }

      if (agents && Object.keys(agents).length > 0) {
        console.log(chalk.bold('Agents:'));
        console.log(
          chalk.gray('Install with: ark install marketplace/agents/<name>\n')
        );

        for (const [key, agent] of Object.entries(agents)) {
          const icon = '🤖';
          const agentName = `marketplace/agents/${key.padEnd(12)}`;
          const agentDesc = agent.description;
          console.log(
            `${icon} ${chalk.green(agentName)} ${chalk.gray(agentDesc)}`
          );
          const namespaceInfo = `namespace: ${agent.namespace || 'default'}`;
          console.log(`   ${chalk.dim(namespaceInfo)}`);
          console.log();
        }
      }

      console.log(
        chalk.cyan(
          `Repository: ${repoUrl}`
        )
      );
      console.log(
        chalk.cyan(
          `Registry: ${registry}`
        )
      );
      console.log();
    });

  marketplace.addCommand(list);

  return marketplace;
}

export {createMarketplaceCommand};
