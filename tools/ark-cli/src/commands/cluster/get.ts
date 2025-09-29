import {Command} from 'commander';
import output from '../../lib/output.js';
import {getClusterInfo} from '../../lib/cluster.js';

export function createGetCommand(): Command {
  const get = new Command('get');
  get
    .description('get current kubernetes cluster information')
    .option('-c, --context <context>', 'kubernetes context to use')
    .option('-o, --output <format>', 'output format (text|json)', 'text')
    .action(async (options) => {
      try {
        const clusterInfo = await getClusterInfo(options.context);

        if (clusterInfo.error) {
          output.error('getting cluster info:', clusterInfo.error);
          process.exit(1);
        }

        if (options.output === 'json') {
          console.log(
            JSON.stringify(
              {
                context: clusterInfo.context,
                namespace: clusterInfo.namespace,
                type: clusterInfo.type,
                ip: clusterInfo.ip,
              },
              null,
              2
            )
          );
        } else {
          // Text format (default)
          console.log(`context: ${clusterInfo.context}`);
          console.log(`namespace: ${clusterInfo.namespace}`);
          console.log(`type: ${clusterInfo.type}`);
          console.log(`ip: ${clusterInfo.ip || 'unknown'}`);
        }
      } catch (error) {
        output.error(
          'failed to get cluster info:',
          error instanceof Error ? error.message : 'Unknown error'
        );
        process.exit(1);
      }
    });

  return get;
}
