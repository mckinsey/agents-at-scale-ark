import {ProviderConfigCollectorFactory} from './factory.js';
import {OpenAIConfigCollector} from './openai.js';
import {AzureConfigCollector} from './azure.js';
import {BedrockConfigCollector} from './bedrock.js';
import {AnthropicConfigCollector} from './anthropic.js';

describe('ProviderConfigCollectorFactory', () => {
  describe('create', () => {
    it('creates OpenAI collector for openai type', () => {
      const collector = ProviderConfigCollectorFactory.create('openai');
      expect(collector).toBeInstanceOf(OpenAIConfigCollector);
    });

    it('creates Azure collector for azure type', () => {
      const collector = ProviderConfigCollectorFactory.create('azure');
      expect(collector).toBeInstanceOf(AzureConfigCollector);
    });

    it('creates Bedrock collector for bedrock type', () => {
      const collector = ProviderConfigCollectorFactory.create('bedrock');
      expect(collector).toBeInstanceOf(BedrockConfigCollector);
    });

    it('creates Anthropic collector for anthropic type', () => {
      const collector = ProviderConfigCollectorFactory.create('anthropic');
      expect(collector).toBeInstanceOf(AnthropicConfigCollector);
    });

    it('throws error for unknown provider type', () => {
      expect(() => {
        ProviderConfigCollectorFactory.create('unknown');
      }).toThrow('Unknown provider type: unknown');
    });

    it('throws error for empty provider type', () => {
      expect(() => {
        ProviderConfigCollectorFactory.create('');
      }).toThrow('Unknown provider type: ');
    });
  });
});
