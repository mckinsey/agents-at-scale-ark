import chalk from 'chalk';
import { Command } from 'commander';
import { spawn } from 'child_process';
import open from 'open';

const DASHBOARD_PORT = 3274; // DASH on phone keypad

export function createDashboardCommand(): Command {
  const dashboardCommand = new Command('dashboard');
  dashboardCommand
    .description('Open the ARK dashboard in your browser')
    .action(async () => {
      try {
        // Find the dashboard service using kubectl
        const { execSync } = await import('child_process');
        
        // Get all services and look for ark-dashboard
        let serviceName = '';
        let namespace = 'default';
        
        try {
          // Look for service with ark-dashboard in the name
          const services = execSync(
            `kubectl get svc -A -o json | jq -r '.items[] | select(.metadata.name | contains("ark-dashboard")) | .metadata.namespace + "/" + .metadata.name'`,
            { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
          ).trim();
          
          if (services) {
            const [ns, svc] = services.split('\n')[0].split('/');
            namespace = ns;
            serviceName = svc;
          } else {
            // Try to find by label
            const servicesByLabel = execSync(
              `kubectl get svc -A -l app=ark-dashboard -o json | jq -r '.items[0] | .metadata.namespace + "/" + .metadata.name'`,
              { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
            ).trim();
            
            if (servicesByLabel && servicesByLabel !== 'null/null') {
              const [ns, svc] = servicesByLabel.split('/');
              namespace = ns;
              serviceName = svc;
            }
          }
        } catch (error) {
          // Kubectl or jq might not be available
        }
        
        if (!serviceName) {
          console.error(chalk.red('Error: ARK dashboard service not found in cluster'));
          process.exit(1);
        }
        
        // Get the service port
        let servicePort = '3000'; // Default port
        try {
          servicePort = execSync(
            `kubectl get svc ${serviceName} -n ${namespace} -o jsonpath='{.spec.ports[0].port}'`,
            { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
          ).trim();
        } catch (error) {
          // Use default port
        }
        
        console.log(chalk.cyan('Connecting to dashboard...'));
        
        const portForward = spawn('kubectl', [
          'port-forward',
          '-n', namespace,
          `svc/${serviceName}`,
          `${DASHBOARD_PORT}:${servicePort}`
        ], {
          stdio: ['inherit', 'pipe', 'pipe']
        });
        
        // Wait a moment for port forward to establish
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Show running message before opening browser
        const url = `http://localhost:${DASHBOARD_PORT}`;
        console.log(chalk.green(`ARK dashboard running on: ${url}`));
        console.log(chalk.gray('Press Ctrl+C to stop'));
        
        // Open browser
        await open(url);
        
        // Handle errors only
        portForward.stderr?.on('data', (data) => {
          const message = data.toString();
          if (message.includes('bind: address already in use')) {
            console.error(chalk.red(`\nError: Port ${DASHBOARD_PORT} is already in use`));
            console.error(chalk.yellow('Another dashboard session may be running'));
            process.exit(1);
          }
          // Suppress all kubectl output except critical errors
        });
        
        portForward.on('close', (code) => {
          if (code !== 0 && code !== null) {
            console.error(chalk.red(`\nPort forwarding stopped with code ${code}`));
          }
          process.exit(code || 0);
        });
        
        // Handle Ctrl+C gracefully
        process.on('SIGINT', () => {
          portForward.kill();
          process.exit(0);
        });
        
      } catch (error) {
        console.error(chalk.red('Failed to start dashboard:'), error);
        process.exit(1);
      }
    });

  return dashboardCommand;
}