import { spawn } from 'node:child_process';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getRawMarketplaceItemById } from '@/lib/services/marketplace-fetcher';
import {
  validateHelmInstallation,
  helmReleaseNameSchema,
  helmNamespaceSchema,
} from '@/lib/utils/helm-validation';

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
      shell: false, // no shell interpretation
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

    // Collect stdout
    helmProcess.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    // Collect stderr
    helmProcess.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    // Handle process exit
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

    // Handle process errors
    helmProcess.on('error', (error) => {
      completed = true;
      clearTimeout(timeout);
      reject(new Error(`Failed to execute Helm command: ${error.message}`));
    });
  });
}

/**
 * Check if Helm is available
 */
async function checkHelmAvailable(): Promise<{
  available: boolean;
  error?: string;
}> {
  try {
    const { stdout } = await executeHelmCommand(
      'helm',
      ['version', '--short'],
      10000,
    );
    console.log('Helm version:', stdout.trim());
    return { available: true };
  } catch (error) {
    console.error('Helm not available:', error);
    return {
      available: false,
      error:
        'Helm CLI is not available. Please ensure helm is installed and accessible.',
    };
  }
}

/**
 * Maps source item type to marketplace installation path category.
 * Services and executors have dedicated paths; agents and demos use 'agents'.
 */
function getMarketplaceCategoryPath(
  itemType?: 'service' | 'agent' | 'demo' | 'executor',
): string {
  if (itemType === 'service') return 'services';
  if (itemType === 'executor') return 'executors';
  return 'agents';
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Check if we should try direct installation or just return the command
    const { mode } = await request.json().catch(() => ({ mode: 'command' }));

    // Fetch the raw marketplace item with Ark configuration
    const item = await getRawMarketplaceItemById(id);

    if (!item) {
      return NextResponse.json(
        { error: 'Marketplace item not found' },
        { status: 404 },
      );
    }

    // Check if item has Ark configuration
    if (!item.ark?.chartPath || !item.ark?.helmReleaseName) {
      return NextResponse.json(
        { error: 'Item does not have installation configuration' },
        { status: 400 },
      );
    }

    const { ark } = item;

    // Validate inputs
    try {
      validateHelmInstallation({
        helmReleaseName: ark.helmReleaseName,
        chartPath: ark.chartPath,
        namespace: ark.namespace,
        installArgs: ark.installArgs,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: `Validation failed: ${error.issues[0].message}` },
          { status: 400 },
        );
      }
      if (error instanceof Error) {
        return NextResponse.json(
          { error: `Validation failed: ${error.message}` },
          { status: 400 },
        );
      }
      throw error;
    }

    console.log(`Installing ${item.name} from ${ark.chartPath}`);

    // Build helm argument array
    const helmArgs: string[] = [
      'upgrade',
      '--install',
      ark.helmReleaseName!,
      ark.chartPath!,
    ];

    // Add namespace if specified
    if (ark.namespace) {
      helmArgs.push('--namespace', ark.namespace);
    }

    // Add any additional install args
    if (ark.installArgs) {
      helmArgs.push(...ark.installArgs);
    }

    const helmCommand = `helm ${helmArgs.join(' ')}`;

    // Return the command for user to run
    if (mode === 'command') {
      // Generate both helm and ark CLI commands
      const arkCommand = `ark install marketplace/${getMarketplaceCategoryPath(item.type)}/${id}`;

      return NextResponse.json({
        status: 'command',
        name: item.name || id,
        helmCommand,
        arkCommand,
        namespace: ark.namespace,
        message: 'Run one of these commands in your terminal to install',
      });
    }

    // If mode is 'direct', try to execute (this will likely fail in most deployments)
    console.log('Attempting direct execution:', helmCommand);

    try {
      // First check if helm is available
      const helmCheck = await checkHelmAvailable();
      if (!helmCheck.available) {
        // Return command instead of error
        return NextResponse.json({
          status: 'command',
          name: item.name || id,
          helmCommand,
          arkCommand: `ark install marketplace/${getMarketplaceCategoryPath(item.type)}/${id}`,
          namespace: ark.namespace,
          message:
            'Direct installation not available. Run this command in your terminal:',
        });
      }

      const { stdout, stderr } = await executeHelmCommand('helm', helmArgs);

      if (stderr && !stderr.includes('WARNING')) {
        console.error('Helm stderr:', stderr);
      }

      console.log('Helm stdout:', stdout);

      return NextResponse.json({
        message: `Successfully installed ${item.name}`,
        status: 'installed',
        output: stdout,
      });
    } catch (error) {
      console.error('Direct installation failed, returning command:', error);

      // Return command instead of error
      return NextResponse.json({
        status: 'command',
        name: item.name || id,
        helmCommand,
        arkCommand: `ark install marketplace/${getMarketplaceCategoryPath(item.type)}/${id}`,
        namespace: ark.namespace,
        message:
          'Direct installation not available. Run this command in your terminal:',
      });
    }
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

    // Fetch the raw marketplace item with Ark configuration
    const item = await getRawMarketplaceItemById(id);

    if (!item) {
      return NextResponse.json(
        { error: 'Marketplace item not found' },
        { status: 404 },
      );
    }

    if (!item.ark?.helmReleaseName) {
      return NextResponse.json(
        { error: 'Item does not have uninstallation configuration' },
        { status: 400 },
      );
    }

    const { ark } = item;

    // Validate inputs
    try {
      helmReleaseNameSchema.parse(ark.helmReleaseName);
      if (ark.namespace) {
        helmNamespaceSchema.parse(ark.namespace);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: `Validation failed: ${error.issues[0].message}` },
          { status: 400 },
        );
      }
      throw error;
    }

    console.log(`Uninstalling ${item.name}`);

    // Build helm argument array
    const helmArgs: string[] = ['uninstall', ark.helmReleaseName!];

    // Add namespace if specified
    if (ark.namespace) {
      helmArgs.push('--namespace', ark.namespace);
    }

    const helmCommand = `helm ${helmArgs.join(' ')}`;
    console.log('Executing:', helmCommand);

    // Execute helm command
    try {
      const { stdout, stderr } = await executeHelmCommand('helm', helmArgs);

      if (stderr && !stderr.includes('WARNING')) {
        console.error('Helm stderr:', stderr);
      }

      console.log('Helm stdout:', stdout);

      return NextResponse.json({
        message: `Successfully uninstalled ${item.name}`,
        status: 'uninstalled',
        output: stdout,
      });
    } catch (error) {
      console.error('Helm uninstallation failed:', error);

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return NextResponse.json(
        {
          error: 'Uninstallation failed',
          details: errorMessage,
        },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error('Error uninstalling marketplace item:', error);
    return NextResponse.json(
      { error: 'Failed to uninstall marketplace item' },
      { status: 500 },
    );
  }
}
