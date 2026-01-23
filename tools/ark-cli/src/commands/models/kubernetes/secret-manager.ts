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
    const secretExists = await this.secretExists(config.secretName);

    if (secretExists) {
      await this.updateSecret(config);
      output.success(`updated secret ${config.secretName}`);
    } else {
      await this.createNewSecret(config);
      output.success(`created secret ${config.secretName}`);
    }
  }

  private async secretExists(secretName: string): Promise<boolean> {
    try {
      await execa('kubectl', ['get', 'secret', secretName], {stdio: 'pipe'});
      return true;
    } catch {
      return false;
    }
  }

  private async createNewSecret(config: ProviderConfig): Promise<void> {
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
      secretArgs.push(`--from-literal=token=${config.apiKey}`);
    }

    await execa('kubectl', secretArgs, {stdio: 'pipe'});
  }

  private async updateSecret(config: ProviderConfig): Promise<void> {
    if (config.type === 'bedrock') {
      const {stdout} = await execa(
        'kubectl',
        [
          'create',
          'secret',
          'generic',
          config.secretName,
          `--from-literal=access-key-id=${config.accessKeyId}`,
          `--from-literal=secret-access-key=${config.secretAccessKey}`,
          ...(config.sessionToken
            ? [`--from-literal=session-token=${config.sessionToken}`]
            : []),
          '--dry-run=client',
          '-o',
          'yaml',
        ],
        {stdio: 'pipe'}
      );
      await execa('kubectl', ['apply', '-f', '-'], {
        input: stdout,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } else {
      const {stdout} = await execa(
        'kubectl',
        [
          'create',
          'secret',
          'generic',
          config.secretName,
          `--from-literal=api-key=${config.apiKey}`,
          `--from-literal=token=${config.apiKey}`,
          '--dry-run=client',
          '-o',
          'yaml',
        ],
        {stdio: 'pipe'}
      );
      await execa('kubectl', ['apply', '-f', '-'], {
        input: stdout,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    }
  }
}
