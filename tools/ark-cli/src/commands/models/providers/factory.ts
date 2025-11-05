import {ProviderConfigCollector} from './types.js';
import {OpenAIConfigCollector} from './openai.js';
import {AzureConfigCollector} from './azure.js';
import {BedrockConfigCollector} from './bedrock.js';

/**
 * Factory for creating provider-specific configuration collectors.
 *
 * This factory uses the provider type to instantiate the appropriate collector
 * that knows how to gather configuration for that specific provider.
 * This pattern makes it easy to add new providers without modifying existing code.
 */
export class ProviderConfigCollectorFactory {
  /**
   * Creates a configuration collector for the specified provider type.
   *
   * @param type - The provider type ('openai', 'azure', or 'bedrock')
   * @returns A collector instance for the specified provider
   * @throws Error if the provider type is not recognized
   */
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
