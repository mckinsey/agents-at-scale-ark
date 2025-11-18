import {Command} from 'commander';
import chalk from 'chalk';
import type {ArkConfig} from '../../lib/config.js';
import {getAllMarketplaceServices} from '../../marketplaceServices.js';
import {fetchMarketplaceManifest} from '../../lib/marketplaceFetcher.js';

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
  ${chalk.yellow('ark marketplace list --refresh')}              # Refresh marketplace cache
  ${chalk.yellow('ark install marketplace/services/phoenix')}    # Install Phoenix
  ${chalk.yellow('ark uninstall marketplace/services/phoenix')}  # Uninstall Phoenix
  
${chalk.cyan('Available Services:')}
  • phoenix  - AI/ML observability and evaluation platform
  • langfuse - Open-source LLM observability and analytics
`
    );

  // List command
  const list = new Command('list');
  list
    .alias('ls')
    .description('List available marketplace services')
    .option('--refresh', 'Force refresh marketplace data from repository')
    .action(async (options) => {
      const forceRefresh = options.refresh === true;

      if (forceRefresh) {
        console.log(chalk.gray('Refreshing marketplace data...'));
      }

      const services = await getAllMarketplaceServices(forceRefresh);
      const manifest = await fetchMarketplaceManifest(forceRefresh);

      console.log(chalk.blue('\n🏪 ARK Marketplace Services\n'));

      if (manifest) {
        console.log(
          chalk.dim(
            `Using marketplace.json (version: ${manifest.version})\n`
          )
        );
      } else {
        console.log(
          chalk.dim(
            'Using fallback services (marketplace.json unavailable)\n'
          )
        );
      }

      console.log(
        chalk.gray(
          'Install with: ark install marketplace/services/<service-name>\n'
        )
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
      if (manifest) {
        console.log(
          chalk.dim(
            `Manifest: marketplace.json (${manifest.items?.length || 0} items)`
          )
        );
      }
      console.log();
    });

  marketplace.addCommand(list);

  return marketplace;
}

export {createMarketplaceCommand};
