import {Command} from 'commander';
import chalk from 'chalk';
import type {ArkConfig} from '../../lib/config.js';
import {
  getAllMarketplaceServices,
  getAllMarketplaceAgents,
} from '../../marketplaceServices.js';

function createMarketplaceCommand(_config: ArkConfig): Command {
  const marketplace = new Command('marketplace');
  marketplace
    .description('Manage marketplace services')
    .addHelpText(
      'before',
      `
${chalk.blue('🏪 ARK Marketplace')}
Install community-contributed services from the ARK Marketplace.

Repository: ${chalk.cyan('https://github.com/mckinsey/agents-at-scale-marketplace')}
Registry: ${chalk.cyan('ghcr.io/mckinsey/agents-at-scale-marketplace/charts')}
`
    )
    .addHelpText(
      'after',
      `
${chalk.cyan('Examples:')}
  ${chalk.yellow('ark marketplace list')}                        # List available services
  ${chalk.yellow('ark install marketplace/services/phoenix')}    # Install Phoenix
  ${chalk.yellow('ark install marketplace/agents/noah')}         # Install Noah agent
  ${chalk.yellow('ark uninstall marketplace/services/phoenix')}  # Uninstall Phoenix

${chalk.cyan('Available Services:')}
  • phoenix  - AI/ML observability and evaluation platform
  • langfuse - Open-source LLM observability and analytics
  • noah     - Runtime administration agent with cluster privileges
`
    );

  // List command
  const list = new Command('list');
  list
    .alias('ls')
    .description('List available marketplace services and agents')
    .action(() => {
      const services = getAllMarketplaceServices();
      const agents = getAllMarketplaceAgents();

      console.log(chalk.blue('\n🏪 ARK Marketplace\n'));

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

      console.log(
        chalk.cyan(
          'Repository: https://github.com/mckinsey/agents-at-scale-marketplace'
        )
      );
      console.log(
        chalk.cyan(
          'Registry: oci://ghcr.io/mckinsey/agents-at-scale-marketplace/charts'
        )
      );
      console.log();
    });

  marketplace.addCommand(list);

  return marketplace;
}

export {createMarketplaceCommand};
