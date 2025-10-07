import chalk from 'chalk';

/**
 * Print helpful next steps after successful ARK installation
 */
export function printNextSteps(): void {
  console.log();
  console.log(chalk.green.bold('✓ Installation complete'));
  console.log();
  console.log(chalk.gray('Next steps:'));
  console.log();
  console.log(
    `  ${chalk.gray('docs:')}              ${chalk.blue('https://mckinsey.github.io/agents-at-scale-ark/')}`
  );
  console.log(
    `  ${chalk.gray('create model:')}      ${chalk.white.bold('ark models create default')}`
  );
  console.log(
    `  ${chalk.gray('open dashboard:')}    ${chalk.white.bold('ark dashboard')}`
  );
  console.log(
    `  ${chalk.gray('show agents:')}       ${chalk.white.bold('kubectl get agents')}`
  );
  console.log(
    `  ${chalk.gray('run a query:')}       ${chalk.white.bold('ark query model/default "What are large language models?"')}`
  );
  console.log(
    `  ${chalk.gray('interactive chat:')}  ${chalk.white.bold('ark')} ${chalk.gray("# then choose 'Chat'")}`
  );
  console.log(
    `  ${chalk.gray('new project:')}       ${chalk.white.bold('ark generate project my-agents')}`
  );
  console.log(
    `  ${chalk.gray('install fark:')}      ${chalk.blue('https://mckinsey.github.io/agents-at-scale-ark/developer-guide/cli-tools/')}`
  );
  console.log();
}
