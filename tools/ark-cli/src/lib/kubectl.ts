import {execa} from 'execa';
import type {K8sListResource} from './types.js';

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
