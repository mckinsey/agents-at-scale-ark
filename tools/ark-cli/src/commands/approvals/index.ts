import {Command, type OptionValues} from 'commander';
import type {ArkConfig} from '../../lib/config.js';
import {loadConfig} from '../../lib/config.js';
import output from '../../lib/output.js';
import {ExitCodes} from '../../lib/errors.js';
import {ArkApiProxy} from '../../lib/arkApiProxy.js';
import {ArkApiClient, ArkApiHttpError} from '../../lib/arkApiClient.js';
import {buildApprovalDetails, type ApprovalDetails} from './approvalDetails.js';

const INPUT_REQUIRED_PHASE = 'input-required';
const OUTPUT_FORMAT_JSON = 'json';

interface ApprovalsCommandOptions {
  namespace?: string;
  output?: string;
}

/**
 * Read a subcommand's options merged with the parent's. Options declared on the
 * parent `approvals` command (`--namespace`, `--output`) are captured as global
 * options by commander, so a subcommand's local options alone would miss them.
 */
function resolveOptions(command: Command): ApprovalsCommandOptions {
  const merged: OptionValues = command.optsWithGlobals();
  return {
    namespace:
      typeof merged.namespace === 'string' ? merged.namespace : undefined,
    output: typeof merged.output === 'string' ? merged.output : undefined,
  };
}

type ApprovalsClient = Pick<ArkApiClient, 'listA2ATasks' | 'getA2ATask'>;

/**
 * List tool approvals awaiting a human decision. A2A also uses the
 * `input-required` phase for ordinary remote-agent input requests, so only
 * tasks that carry approval metadata (recognised by `buildApprovalDetails`) are
 * returned. A failed lookup for one task does not fail the whole list.
 */
export async function listApprovals(
  client: ApprovalsClient,
  namespace?: string
): Promise<ApprovalDetails[]> {
  const tasks = await client.listA2ATasks(namespace);
  const pending = tasks.filter((t) => t.phase === INPUT_REQUIRED_PHASE);

  const results = await Promise.allSettled(
    pending.map((item) => client.getA2ATask(item.name, namespace))
  );

  const details: ApprovalDetails[] = [];
  for (const [index, result] of results.entries()) {
    if (result.status === 'rejected') {
      const reason =
        result.reason instanceof Error ? result.reason.message : result.reason;
      output.warning(`skipping ${pending[index].name}: ${reason}`);
      continue;
    }
    const approval = buildApprovalDetails(result.value);
    if (approval) details.push(approval);
  }

  return details;
}

function printApprovals(
  approvals: ApprovalDetails[],
  options: ApprovalsCommandOptions
): void {
  if (options.output === OUTPUT_FORMAT_JSON) {
    console.log(JSON.stringify(approvals, null, 2));
    return;
  }

  if (approvals.length === 0) {
    output.info('No pending approvals');
    return;
  }

  for (const approval of approvals) {
    const tools = approval.toolCalls
      .map((tc) => tc.function?.name ?? tc.type)
      .join(', ');
    const expiry = approval.expiresAt
      ? `${approval.expired ? 'expired' : 'expires'} ${approval.expiresAt.toISOString()}`
      : 'no expiry';

    console.log(approval.name);
    console.log(`  agent:   ${approval.agentName ?? 'unknown'}`);
    console.log(`  tools:   ${tools || 'none'}`);
    console.log(`  ${expiry}`);
  }
}

/** Map an approval submission error to a user-facing message and exit code. */
export function mapApprovalError(
  error: unknown,
  name: string
): {message: string; exitCode: number} {
  if (error instanceof ArkApiHttpError) {
    if (error.status === 404) {
      return {
        message: `approval '${name}' not found`,
        exitCode: ExitCodes.OperationError,
      };
    }
    if (error.status === 409) {
      return {
        message: `approval '${name}' is not awaiting approval`,
        exitCode: ExitCodes.OperationError,
      };
    }
    if (error.status === 401 || error.status === 403) {
      return {
        message: `not authorized to respond to approval '${name}' (HTTP ${error.status})`,
        exitCode: ExitCodes.OperationError,
      };
    }
    return {message: error.message, exitCode: ExitCodes.OperationError};
  }
  return {
    message: error instanceof Error ? error.message : String(error),
    exitCode: ExitCodes.CliError,
  };
}

async function runList(options: ApprovalsCommandOptions): Promise<void> {
  const config = loadConfig();
  const proxy = new ArkApiProxy(
    undefined,
    config.services?.reusePortForwards ?? false
  );
  try {
    const client = await proxy.start();
    const approvals = await listApprovals(client, options.namespace);
    printApprovals(approvals, options);
  } catch (error) {
    output.error(
      'listing approvals:',
      error instanceof Error ? error.message : error
    );
    process.exit(ExitCodes.CliError);
  } finally {
    proxy.stop();
  }
}

async function runDecision(
  name: string,
  decision: 'approved' | 'rejected',
  options: ApprovalsCommandOptions
): Promise<void> {
  const config = loadConfig();
  const proxy = new ArkApiProxy(
    undefined,
    config.services?.reusePortForwards ?? false
  );
  try {
    const client = await proxy.start();
    await client.submitApproval(name, decision, options.namespace);
    output.success(`approval '${name}' ${decision}`);
  } catch (error) {
    const {message, exitCode} = mapApprovalError(error, name);
    output.error(
      `${decision === 'approved' ? 'approving' : 'rejecting'}:`,
      message
    );
    process.exit(exitCode);
  } finally {
    proxy.stop();
  }
}

export function createApprovalsCommand(_: ArkConfig): Command {
  const approvalsCommand = new Command('approvals');
  approvalsCommand
    .description('List and respond to pending tool approvals')
    .option('-n, --namespace <namespace>', 'namespace')
    .option('-o, --output <format>', 'output format (json or text)', 'text')
    .action(async (_options: ApprovalsCommandOptions, command: Command) => {
      await runList(resolveOptions(command));
    });

  const listCommand = new Command('list');
  listCommand
    .alias('ls')
    .description('List pending tool approvals')
    .option('-n, --namespace <namespace>', 'namespace')
    .option('-o, --output <format>', 'output format (json or text)', 'text')
    .action(async (_options: ApprovalsCommandOptions, command: Command) => {
      await runList(resolveOptions(command));
    });
  approvalsCommand.addCommand(listCommand);

  const approveCommand = new Command('approve');
  approveCommand
    .description('Approve a pending tool call')
    .argument('<name>', 'A2ATask name')
    .option('-n, --namespace <namespace>', 'namespace')
    .action(
      async (
        name: string,
        _options: ApprovalsCommandOptions,
        command: Command
      ) => {
        await runDecision(name, 'approved', resolveOptions(command));
      }
    );
  approvalsCommand.addCommand(approveCommand);

  const rejectCommand = new Command('reject');
  rejectCommand
    .description('Reject a pending tool call')
    .argument('<name>', 'A2ATask name')
    .option('-n, --namespace <namespace>', 'namespace')
    .action(
      async (
        name: string,
        _options: ApprovalsCommandOptions,
        command: Command
      ) => {
        await runDecision(name, 'rejected', resolveOptions(command));
      }
    );
  approvalsCommand.addCommand(rejectCommand);

  return approvalsCommand;
}
