import {ProviderConfigCollector} from './types.js';
import {OpenAIConfigCollector} from './openai.js';
import {AzureConfigCollector} from './azure.js';
import {BedrockConfigCollector} from './bedrock.js';

// Factory for creating provider configuration collectors
export class ProviderConfigCollectorFactory {
  static create(type: string): ProviderConfigCollector {
    switch (type) {
      case 'openai':
        return new OpenAIConfigCollector();
      case 'azure':
        return new AzureConfigCollector();
      case 'bedrock':
        return new BedrockConfigCollector();
      default:
        throw new Error(`Unknown provider type: ${type}`);
    }
  }
}
