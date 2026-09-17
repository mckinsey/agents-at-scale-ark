import {Command} from 'commander';
import type {ArkConfig} from '../../lib/config.js';
import {loadConfig} from '../../lib/config.js';
import output from '../../lib/output.js';
import {ExitCodes} from '../../lib/errors.js';
import {ArkApiProxy} from '../../lib/arkApiProxy.js';
import {
  ArkApiClient,
  ArkApiHttpError,
} from '../../lib/arkApiClient.js';
import {buildApprovalDetails, type ApprovalDetails} from './approvalDetails.js';

const INPUT_REQUIRED_PHASE = 'input-required';
const OUTPUT_FORMAT_JSON = 'json';

interface ApprovalsCommandOptions {
  namespace?: string;
  output?: string;
}

type ApprovalsClient = Pick<ArkApiClient, 'listA2ATasks' | 'getA2ATask'>;

/**
 * List tool approvals awaiting a human decision (A2ATasks in the
 * `input-required` phase), resolving each task's approval details.
 */
export async function listApprovals(
  client: ApprovalsClient,
  namespace?: string
): Promise<ApprovalDetails[]> {
  const tasks = await client.listA2ATasks(namespace);
  const pending = tasks.filter((t) => t.phase === INPUT_REQUIRED_PHASE);

  const details = await Promise.all(
    pending.map(async (item) => {
      const detail = await client.getA2ATask(item.name, namespace);
      return (
        buildApprovalDetails(detail) ?? {
          name: item.name,
          taskId: item.taskId,
          toolCalls: [],
          phase: item.phase ?? INPUT_REQUIRED_PHASE,
          expired: false,
        }
      );
    })
  );

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
    output.error(`${decision === 'approved' ? 'approving' : 'rejecting'}:`, message);
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
    .action(async (options: ApprovalsCommandOptions) => {
      await runList(options);
    });

  const listCommand = new Command('list');
  listCommand
    .alias('ls')
    .description('List pending tool approvals')
    .option('-n, --namespace <namespace>', 'namespace')
    .option('-o, --output <format>', 'output format (json or text)', 'text')
    .action(async (options: ApprovalsCommandOptions) => {
      await runList(options);
    });
  approvalsCommand.addCommand(listCommand);

  const approveCommand = new Command('approve');
  approveCommand
    .description('Approve a pending tool call')
    .argument('<name>', 'A2ATask name')
    .option('-n, --namespace <namespace>', 'namespace')
    .action(async (name: string, options: ApprovalsCommandOptions) => {
      await runDecision(name, 'approved', options);
    });
  approvalsCommand.addCommand(approveCommand);

  const rejectCommand = new Command('reject');
  rejectCommand
    .description('Reject a pending tool call')
    .argument('<name>', 'A2ATask name')
    .option('-n, --namespace <namespace>', 'namespace')
    .action(async (name: string, options: ApprovalsCommandOptions) => {
      await runDecision(name, 'rejected', options);
    });
  approvalsCommand.addCommand(rejectCommand);

  return approvalsCommand;
}
