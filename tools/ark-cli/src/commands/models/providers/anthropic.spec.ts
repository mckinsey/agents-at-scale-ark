import {jest} from '@jest/globals';

const mockInquirer = {
  prompt: jest.fn() as any,
};
jest.unstable_mockModule('inquirer', () => ({
  default: mockInquirer,
}));

const {AnthropicConfigCollector} = await import('./anthropic.js');

describe('AnthropicConfigCollector', () => {
  let collector: InstanceType<typeof AnthropicConfigCollector>;

  beforeEach(() => {
    collector = new AnthropicConfigCollector();
    jest.clearAllMocks();
  });

  describe('collectConfig', () => {
    it('uses provided options without prompting', async () => {
      const options = {
        model: 'claude-3-5-sonnet-20241022',
        baseUrl: 'https://api.anthropic.com/v1',
        apiKey: 'sk-ant-test-key-12345',
      };

      const config = await collector.collectConfig(options);

      expect(mockInquirer.prompt).not.toHaveBeenCalled();
      expect(config).toEqual({
        type: 'anthropic',
        modelValue: 'claude-3-5-sonnet-20241022',
        secretName: '',
        baseUrl: 'https://api.anthropic.com/v1',
        apiKey: 'sk-ant-test-key-12345',
      });
    });

    it('prompts for missing baseUrl with default', async () => {
      mockInquirer.prompt.mockResolvedValueOnce({
        baseUrl: 'https://api.anthropic.com/v1',
      });
      mockInquirer.prompt.mockResolvedValueOnce({apiKey: 'sk-ant-custom-key'});

      const options = {
        model: 'claude-3-haiku-20240307',
      };

      const config = await collector.collectConfig(options);

      expect(mockInquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'input',
          name: 'baseUrl',
          message: 'base URL:',
          default: 'https://api.anthropic.com/v1',
          validate: expect.any(Function),
        }),
      ]);
      expect(config.baseUrl).toBe('https://api.anthropic.com/v1');
    });

    it('validates baseUrl is required', async () => {
      mockInquirer.prompt.mockResolvedValueOnce({baseUrl: ''});

      const options = {
        model: 'claude-3-opus-20240229',
      };

      await expect(collector.collectConfig(options)).rejects.toThrow(
        'base URL is required'
      );
    });

    it('validates baseUrl is a valid URL', async () => {
      const options = {
        model: 'claude-3-opus-20240229',
      };

      mockInquirer.prompt.mockImplementationOnce(async (questions: any) => {
        const validate = questions[0].validate;

        expect(validate('not-a-url')).toBe('please enter a valid URL');
        expect(validate('')).toBe('base URL is required');
        expect(validate('https://api.anthropic.com')).toBe(true);

        return {baseUrl: 'https://api.anthropic.com'};
      });

      mockInquirer.prompt.mockResolvedValueOnce({apiKey: 'sk-ant-key'});

      await collector.collectConfig(options);
    });

    it('removes trailing slash from baseUrl', async () => {
      const options = {
        model: 'claude-3-haiku-20240307',
        baseUrl: 'https://api.anthropic.com/v1/',
        apiKey: 'sk-ant-test-key',
      };

      const config = await collector.collectConfig(options);

      expect(config.baseUrl).toBe('https://api.anthropic.com/v1');
    });

    it('prompts for missing apiKey as password field', async () => {
      mockInquirer.prompt.mockResolvedValueOnce({apiKey: 'sk-ant-secret-key'});

      const options = {
        model: 'claude-3-5-sonnet-20241022',
        baseUrl: 'https://api.anthropic.com/v1',
      };

      const config = await collector.collectConfig(options);

      expect(mockInquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'password',
          name: 'apiKey',
          message: 'API key:',
          mask: '*',
          validate: expect.any(Function),
        }),
      ]);
      expect(config.apiKey).toBe('sk-ant-secret-key');
    });

    it('validates apiKey is required', async () => {
      mockInquirer.prompt.mockResolvedValueOnce({apiKey: ''});

      const options = {
        model: 'claude-3-opus-20240229',
        baseUrl: 'https://api.anthropic.com/v1',
      };

      await expect(collector.collectConfig(options)).rejects.toThrow(
        'API key is required'
      );
    });

    it('tests apiKey validation function', async () => {
      const options = {
        model: 'claude-3-haiku-20240307',
        baseUrl: 'https://api.anthropic.com/v1',
      };

      mockInquirer.prompt.mockImplementationOnce(async (questions: any) => {
        const validate = questions[0].validate;

        expect(validate('')).toBe('API key is required');
        expect(validate('sk-ant-valid-key')).toBe(true);

        return {apiKey: 'sk-ant-valid-key'};
      });

      await collector.collectConfig(options);
    });

    it('collects full configuration through interactive prompts', async () => {
      mockInquirer.prompt.mockResolvedValueOnce({
        baseUrl: 'https://api.anthropic.com/v1/',
      });
      mockInquirer.prompt.mockResolvedValueOnce({
        apiKey: 'sk-ant-api-abc123',
      });

      const options = {
        model: 'claude-3-5-sonnet-20241022',
      };

      const config = await collector.collectConfig(options);

      expect(config).toEqual({
        type: 'anthropic',
        modelValue: 'claude-3-5-sonnet-20241022',
        secretName: '',
        baseUrl: 'https://api.anthropic.com/v1',
        apiKey: 'sk-ant-api-abc123',
      });
    });

    it('mixes CLI options and interactive prompts', async () => {
      mockInquirer.prompt.mockResolvedValueOnce({
        apiKey: 'sk-ant-prompted-key',
      });

      const options = {
        model: 'claude-3-haiku-20240307',
        baseUrl: 'https://custom-anthropic.com/v1',
      };

      const config = await collector.collectConfig(options);

      expect(config).toEqual({
        type: 'anthropic',
        modelValue: 'claude-3-haiku-20240307',
        secretName: '',
        baseUrl: 'https://custom-anthropic.com/v1',
        apiKey: 'sk-ant-prompted-key',
      });
    });

    it('handles custom Anthropic-compatible endpoints', async () => {
      const options = {
        model: 'claude-3-opus-20240229',
        baseUrl: 'https://gateway.example.com/anthropic/v1',
        apiKey: 'custom-key-123',
      };

      const config = await collector.collectConfig(options);

      expect(config).toEqual({
        type: 'anthropic',
        modelValue: 'claude-3-opus-20240229',
        secretName: '',
        baseUrl: 'https://gateway.example.com/anthropic/v1',
        apiKey: 'custom-key-123',
      });
    });
  });
});
