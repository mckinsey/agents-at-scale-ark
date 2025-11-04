import {execa} from 'execa';
import output from '../../../lib/output.js';
import {ProviderConfig} from '../providers/index.js';

// Secret manager interface
export interface SecretManager {
  createSecret(config: ProviderConfig): Promise<void>;
}

// Kubernetes secret manager implementation
export class KubernetesSecretManager implements SecretManager {
  async createSecret(config: ProviderConfig): Promise<void> {
    const secretArgs = ['create', 'secret', 'generic', config.secretName];

    if (config.type === 'bedrock') {
      secretArgs.push(`--from-literal=access-key-id=${config.accessKeyId}`);
      secretArgs.push(
        `--from-literal=secret-access-key=${config.secretAccessKey}`
      );
      if (config.sessionToken) {
        secretArgs.push(`--from-literal=session-token=${config.sessionToken}`);
      }
    } else {
      secretArgs.push(`--from-literal=api-key=${config.apiKey}`);
    }

    await execa('kubectl', secretArgs, {stdio: 'pipe'});
    output.success(`created secret ${config.secretName}`);
  }
}
