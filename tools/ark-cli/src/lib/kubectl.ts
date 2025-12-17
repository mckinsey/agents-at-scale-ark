import {execa} from 'execa';
import chalk from 'chalk';
import type {K8sListResource} from './types.js';
import {EVENT_ANNOTATIONS} from './constants.js';

interface K8sResource {
  metadata: {
    name: string;
    creationTimestamp?: string;
  };
}

export async function getResource<T extends K8sResource>(
  resourceType: string,
  name: string
): Promise<T> {
  if (name === '@latest') {
    const result = await execa(
      'kubectl',
      [
        'get',
        resourceType,
        '--sort-by=.metadata.creationTimestamp',
        '-o',
        'json',
      ],
      {stdio: 'pipe'}
    );

    const data = JSON.parse(result.stdout) as K8sListResource<T>;
    const resources = data.items || [];

    if (resources.length === 0) {
      throw new Error(`No ${resourceType} found`);
    }

    return resources[resources.length - 1];
  }

  const result = await execa(
    'kubectl',
    ['get', resourceType, name, '-o', 'json'],
    {stdio: 'pipe'}
  );

  return JSON.parse(result.stdout) as T;
}

export async function listResources<T extends K8sResource>(
  resourceType: string,
  options?: {
    namespace?: string,
    labels?: string,
    sortBy?: string;
  }
): Promise<T[]> {
  const args: string[] = ['get', resourceType];

  if (options?.sortBy) {
    args.push(`--sort-by=${options.sortBy}`);
  }

  if (options?.namespace) {
    args.push('-n', options.namespace);
  }

  if (options?.labels) {
    args.push('-l', options.labels);
  }

  args.push('-o', 'json');

  const result = await execa('kubectl', args, {stdio: 'pipe'});
  const data = JSON.parse(result.stdout) as K8sListResource<T>;
  return data.items || [];
}

export async function deleteResource(
  resourceType: string,
  name?: string,
  options?: {
    all?: boolean;
  }
): Promise<void> {
  const args: string[] = ['delete', resourceType];

  if (options?.all) {
    args.push('--all');
  } else if (name) {
    args.push(name);
  }

  await execa('kubectl', args, {stdio: 'pipe'});
}

export async function replaceResource<T extends K8sResource>(
  resource: T
): Promise<T> {
  const result = await execa('kubectl', ['replace', '-f', '-', '-o', 'json'], {
    input: JSON.stringify(resource),
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  return JSON.parse(result.stdout) as T;
}

export async function watchEventsLive(queryName: string): Promise<void> {
  const seenEvents = new Set<string>();

  const pollEvents = async () => {
    try {
      const {stdout} = await execa('kubectl', [
        'get',
        'events',
        '--field-selector',
        `involvedObject.name=${queryName}`,
        '-o',
        'json',
      ]);

      const eventsData = JSON.parse(stdout);
      for (const event of eventsData.items || []) {
        const eventId = event.metadata?.uid;

        if (eventId && !seenEvents.has(eventId)) {
          seenEvents.add(eventId);

          const annotations = event.metadata?.annotations || {};
          const eventData = annotations[EVENT_ANNOTATIONS.EVENT_DATA];

          if (eventData) {
            const now = new Date();
            const hours = now.getHours().toString().padStart(2, '0');
            const minutes = now.getMinutes().toString().padStart(2, '0');
            const seconds = now.getSeconds().toString().padStart(2, '0');
            const millis = now.getMilliseconds().toString().padStart(3, '0');
            const timestamp = `${hours}:${minutes}:${seconds}.${millis}`;

            const reason = event.reason || 'Unknown';
            const eventType = event.type || 'Normal';

            const colorCode =
              eventType === 'Normal' ? 32 : eventType === 'Warning' ? 33 : 31;
            console.log(
              `${timestamp} \x1b[${colorCode}m${reason}\x1b[0m ${eventData}`
            );
          }
        }
      }
      // eslint-disable-next-line no-empty, @typescript-eslint/no-unused-vars
    } catch (error) {}
  };

  const pollInterval = setInterval(pollEvents, 200);

  const timeoutSeconds = 300;

  const waitProcess = execa(
    'kubectl',
    [
      'wait',
      '--for=condition=Completed',
      `query/${queryName}`,
      `--timeout=${timeoutSeconds}s`,
    ],
    {
      timeout: timeoutSeconds * 1000,
    }
  );

  try {
    await waitProcess;
    await pollEvents();
    await new Promise((resolve) => setTimeout(resolve, 200));
    await pollEvents();
  } catch (error) {
    console.error(
      chalk.red(
        'Query wait failed:',
        error instanceof Error ? error.message : 'Unknown error'
      )
    );
  } finally {
    clearInterval(pollInterval);
  }
}
