import { spawn } from 'node:child_process';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getRawMarketplaceItemById } from '@/lib/services/marketplace-server';

/**
 * Helm release name validation (max 53 chars, RFC 1123)
 */
const helmReleaseNameSchema = z
  .string()
  .min(1, 'Helm release name is required')
  .max(53, 'Helm release name must be 53 characters or less')
  .regex(
    /^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/,
    'Helm release name must consist of lowercase letters, numbers, hyphens, and dots, ' +
      'and must start and end with an alphanumeric character',
  );

/**
 * Kubernetes namespace validation (RFC 1123)
 */
const helmNamespaceSchema = z
  .string()
  .min(1, 'Namespace is required')
  .max(63, 'Namespace must be 63 characters or less')
  .regex(
    /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/,
    'Namespace must consist of lowercase letters, numbers, and hyphens, ' +
      'and must start and end with an alphanumeric character (RFC 1123)',
  );

/**
 * Execute Helm command using spawn (without shell)
 */
async function executeHelmCommand(
  command: string,
  args: string[],
  timeoutMs: number = 300000,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const helmProcess = spawn(command, args, {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let completed = false;

    const timeout = setTimeout(() => {
      if (!completed) {
        helmProcess.kill('SIGTERM');
        reject(new Error(`Helm command timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    helmProcess.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    helmProcess.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    helmProcess.on('close', (code) => {
      completed = true;
      clearTimeout(timeout);

      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(
            `Helm command failed with exit code ${code}: ${stderr || stdout}`,
          ),
        );
      }
    });

    helmProcess.on('error', (error) => {
      completed = true;
      clearTimeout(timeout);
      reject(new Error(`Failed to execute Helm command: ${error.message}`));
    });
  });
}

/**
 * Maps source item type to marketplace installation path category.
 */
function getMarketplaceCategoryPath(
  itemType?: 'service' | 'agent' | 'demo' | 'executor',
): string {
  if (itemType === 'service') return 'services';
  if (itemType === 'executor') return 'executors';
  return 'agents';
}

/**
 * Validate Helm release name and namespace inputs
 */
function validateHelmInputs(
  releaseName: string,
  namespace?: string,
): NextResponse | null {
  try {
    helmReleaseNameSchema.parse(releaseName);
    if (namespace) {
      helmNamespaceSchema.parse(namespace);
    }
    return null;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: `Validation failed: ${error.issues[0].message}` },
        { status: 400 },
      );
    }
    throw error;
  }
}

/**
 * Fetch and validate marketplace item exists
 */
async function fetchAndValidateMarketplaceItem(id: string, namespace: string) {
  const item = await getRawMarketplaceItemById(id, namespace);

  if (!item) {
    return {
      item: null,
      error: NextResponse.json(
        { error: 'Marketplace item not found' },
        { status: 404 },
      ),
    };
  }

  return { item, error: null };
}

/**
 * Build command response for installation
 */
function buildCommandResponse(
  item: { name?: string; type?: 'service' | 'agent' | 'demo' | 'executor' },
  id: string,
  helmCommand: string,
  namespace?: string,
  message: string = 'Run one of these commands in your terminal to install',
) {
  return NextResponse.json({
    status: 'command',
    name: item.name || id,
    helmCommand,
    arkCommand: `ark install marketplace/${getMarketplaceCategoryPath(item.type)}/${id}`,
    namespace,
    message,
  });
}

/**
 * Log Helm stderr output if it contains non-WARNING content
 */
function logHelmStderr(stderr: string): void {
  if (stderr && !stderr.includes('WARNING')) {
    console.error('Helm stderr:', stderr);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const namespace = request.nextUrl.searchParams.get('namespace');
    if (!namespace) {
      return NextResponse.json(
        { error: 'namespace query parameter is required' },
        { status: 400 },
      );
    }

    const { item, error } = await fetchAndValidateMarketplaceItem(id, namespace);
    if (error) return error;

    if (!item!.ark?.chartPath || !item!.ark?.helmReleaseName) {
      return NextResponse.json(
        { error: 'Item does not have installation configuration' },
        { status: 400 },
      );
    }

    const ark = item!.ark;

    const validationError = validateHelmInputs(
      ark.helmReleaseName!,
      ark.namespace,
    );
    if (validationError) return validationError;

    console.log(`Installing ${item!.name} from ${ark.chartPath}`);

    const helmArgs: string[] = [
      'upgrade',
      '--install',
      ark.helmReleaseName!,
      ark.chartPath!,
    ];

    if (ark.namespace) {
      helmArgs.push('--namespace', ark.namespace);
    }

    if (ark.installArgs) {
      helmArgs.push(...ark.installArgs);
    }

    const helmCommand = `helm ${helmArgs.join(' ')}`;

    return buildCommandResponse(item!, id, helmCommand, ark.namespace);
  } catch (error) {
    console.error('Error installing marketplace item:', error);
    return NextResponse.json(
      { error: 'Failed to install marketplace item' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const namespace = request.nextUrl.searchParams.get('namespace');
    if (!namespace) {
      return NextResponse.json(
        { error: 'namespace query parameter is required' },
        { status: 400 },
      );
    }

    const { item, error } = await fetchAndValidateMarketplaceItem(id, namespace);
    if (error) return error;

    if (!item!.ark?.helmReleaseName) {
      return NextResponse.json(
        { error: 'Item does not have uninstallation configuration' },
        { status: 400 },
      );
    }

    const ark = item!.ark;

    const validationError = validateHelmInputs(
      ark.helmReleaseName!,
      ark.namespace,
    );
    if (validationError) return validationError;

    console.log(`Uninstalling ${item!.name}`);

    const helmArgs: string[] = ['uninstall', ark.helmReleaseName!];

    if (ark.namespace) {
      helmArgs.push('--namespace', ark.namespace);
    }

    const helmCommand = `helm ${helmArgs.join(' ')}`;

    return NextResponse.json({
      status: 'command',
      name: item!.name,
      helmCommand,
      namespace: ark.namespace,
      message: 'Run this command in your terminal to uninstall',
    });
  } catch (error) {
    console.error('Error uninstalling marketplace item:', error);
    return NextResponse.json(
      { error: 'Failed to uninstall marketplace item' },
      { status: 500 },
    );
  }
}
