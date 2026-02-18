import { exec } from 'child_process';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { promisify } from 'util';

import { getRawMarketplaceItemById } from '@/lib/services/marketplace-fetcher';

const execAsync = promisify(exec);

async function checkHelmAvailable(): Promise<{
  available: boolean;
  error?: string;
}> {
  try {
    const { stdout } = await execAsync('helm version --short');
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

async function checkKubernetesConnection(): Promise<{
  connected: boolean;
  error?: string;
}> {
  try {
    const { stdout } = await execAsync(
      'kubectl cluster-info --request-timeout=5s',
    );
    console.log('Kubernetes cluster info:', stdout.trim());
    return { connected: true };
  } catch (error) {
    console.error('Kubernetes connection failed:', error);
    return {
      connected: false,
      error:
        'Cannot connect to Kubernetes cluster. Please ensure kubectl is configured.',
    };
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Check prerequisites
    const helmCheck = await checkHelmAvailable();
    if (!helmCheck.available) {
      return NextResponse.json(
        {
          error: 'Helm not available',
          details: helmCheck.error,
          instructions:
            'The dashboard server needs access to helm CLI to install marketplace items.',
        },
        { status: 503 },
      );
    }

    const k8sCheck = await checkKubernetesConnection();
    if (!k8sCheck.connected) {
      return NextResponse.json(
        {
          error: 'Kubernetes cluster not accessible',
          details: k8sCheck.error,
          instructions:
            'The dashboard server needs access to a Kubernetes cluster.',
        },
        { status: 503 },
      );
    }

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
    console.log(`Installing ${item.name} from ${ark.chartPath}`);

    // Build helm command
    const helmArgs = [
      'upgrade',
      '--install',
      ark.helmReleaseName,
      ark.chartPath,
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
    console.log('Executing:', helmCommand);

    // Execute helm command
    try {
      const { stdout, stderr } = await execAsync(helmCommand);

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
      console.error('Helm installation failed:', error);
      console.error('Command was:', helmCommand);

      let errorDetails = 'Unknown error';
      if (error instanceof Error) {
        errorDetails = error.message;
        // Check for common helm errors
        if (error.message.includes('command not found')) {
          errorDetails = 'Helm is not installed or not in PATH';
        } else if (error.message.includes('cannot connect')) {
          errorDetails = 'Cannot connect to Kubernetes cluster';
        } else if (error.message.includes('unauthorized')) {
          errorDetails = 'Not authorized to access Kubernetes cluster';
        }
      }

      return NextResponse.json(
        {
          error: 'Installation failed',
          details: errorDetails,
          command: helmCommand,
        },
        { status: 500 },
      );
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
    console.log(`Uninstalling ${item.name}`);

    // Build helm uninstall command
    const helmArgs = ['uninstall', ark.helmReleaseName];

    // Add namespace if specified
    if (ark.namespace) {
      helmArgs.push('--namespace', ark.namespace);
    }

    const helmCommand = `helm ${helmArgs.join(' ')}`;
    console.log('Executing:', helmCommand);

    // Execute helm command
    try {
      const { stdout, stderr } = await execAsync(helmCommand);

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
