import {jest} from '@jest/globals';

const mockInquirer = {
  prompt: jest.fn() as any,
};
jest.unstable_mockModule('inquirer', () => ({
  default: mockInquirer,
}));

const {OpenAIConfigCollector} = await import('./openai.js');

describe('OpenAIConfigCollector', () => {
  let collector: InstanceType<typeof OpenAIConfigCollector>;

  beforeEach(() => {
    collector = new OpenAIConfigCollector();
    jest.clearAllMocks();
  });

  describe('collectConfig', () => {
    it('uses provided options without prompting', async () => {
      const options = {
        model: 'gpt-4o-mini',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test-key-12345',
      };

      const config = await collector.collectConfig(options);

      expect(mockInquirer.prompt).not.toHaveBeenCalled();
      expect(config).toEqual({
        type: 'openai',
        modelValue: 'gpt-4o-mini',
        secretName: '',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test-key-12345',
      });
    });

    it('prompts for missing baseUrl', async () => {
      mockInquirer.prompt.mockResolvedValueOnce({
        baseUrl: 'https://custom-openai.com',
      });
      mockInquirer.prompt.mockResolvedValueOnce({apiKey: 'sk-custom-key'});

      const options = {
        model: 'gpt-4',
      };

      const config = await collector.collectConfig(options);

      expect(mockInquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'input',
          name: 'baseUrl',
          message: 'base URL:',
          validate: expect.any(Function),
        }),
      ]);
      expect(config.baseUrl).toBe('https://custom-openai.com');
    });

    it('validates baseUrl is required', async () => {
      mockInquirer.prompt.mockResolvedValueOnce({baseUrl: ''});

      const options = {
        model: 'gpt-4',
      };

      // The validation happens in the prompt, but we test the final check
      await expect(collector.collectConfig(options)).rejects.toThrow(
        'base URL is required'
      );
    });

    it('validates baseUrl is a valid URL', async () => {
      const options = {
        model: 'gpt-4',
      };

      // Get the validate function from the prompt call
      mockInquirer.prompt.mockImplementationOnce(async (questions: any) => {
        const validate = questions[0].validate;

        // Test invalid URL
        expect(validate('not-a-url')).toBe('please enter a valid URL');

        // Test empty string
        expect(validate('')).toBe('base URL is required');

        // Test valid URL
        expect(validate('https://api.openai.com')).toBe(true);

        return {baseUrl: 'https://api.openai.com'};
      });

      mockInquirer.prompt.mockResolvedValueOnce({apiKey: 'sk-key'});

      await collector.collectConfig(options);
    });

    it('removes trailing slash from baseUrl', async () => {
      const options = {
        model: 'gpt-4',
        baseUrl: 'https://api.openai.com/v1/',
        apiKey: 'sk-test-key',
      };

      const config = await collector.collectConfig(options);

      expect(config.baseUrl).toBe('https://api.openai.com/v1');
    });

    it('prompts for missing apiKey as password field', async () => {
      mockInquirer.prompt.mockResolvedValueOnce({apiKey: 'sk-secret-key'});

      const options = {
        model: 'gpt-4',
        baseUrl: 'https://api.openai.com/v1',
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
      expect(config.apiKey).toBe('sk-secret-key');
    });

    it('validates apiKey is required', async () => {
      mockInquirer.prompt.mockResolvedValueOnce({apiKey: ''});

      const options = {
        model: 'gpt-4',
        baseUrl: 'https://api.openai.com/v1',
      };

      await expect(collector.collectConfig(options)).rejects.toThrow(
        'API key is required'
      );
    });

    it('tests apiKey validation function', async () => {
      const options = {
        model: 'gpt-4',
        baseUrl: 'https://api.openai.com/v1',
      };

      // Get the validate function from the prompt call
      mockInquirer.prompt.mockImplementationOnce(async (questions: any) => {
        const validate = questions[0].validate;

        // Test empty string
        expect(validate('')).toBe('API key is required');

        // Test valid key
        expect(validate('sk-valid-key')).toBe(true);

        return {apiKey: 'sk-valid-key'};
      });

      await collector.collectConfig(options);
    });

    it('collects full configuration through interactive prompts', async () => {
      mockInquirer.prompt.mockResolvedValueOnce({
        baseUrl: 'https://api.openai.com/v1/',
      });
      mockInquirer.prompt.mockResolvedValueOnce({
        apiKey: 'sk-proj-abc123',
      });

      const options = {
        model: 'gpt-4o',
      };

      const config = await collector.collectConfig(options);

      expect(config).toEqual({
        type: 'openai',
        modelValue: 'gpt-4o',
        secretName: '',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-proj-abc123',
      });
    });

    it('mixes CLI options and interactive prompts', async () => {
      mockInquirer.prompt.mockResolvedValueOnce({
        apiKey: 'sk-prompted-key',
      });

      const options = {
        model: 'gpt-3.5-turbo',
        baseUrl: 'https://custom-api.com/v1',
      };

      const config = await collector.collectConfig(options);

      expect(config).toEqual({
        type: 'openai',
        modelValue: 'gpt-3.5-turbo',
        secretName: '',
        baseUrl: 'https://custom-api.com/v1',
        apiKey: 'sk-prompted-key',
      });
    });

    it('handles custom OpenAI-compatible endpoints', async () => {
      const options = {
        model: 'llama-3-8b',
        baseUrl: 'https://localhost:8080/v1',
        apiKey: 'local-key-123',
      };

      const config = await collector.collectConfig(options);

      expect(config).toEqual({
        type: 'openai',
        modelValue: 'llama-3-8b',
        secretName: '',
        baseUrl: 'https://localhost:8080/v1',
        apiKey: 'local-key-123',
      });
    });
  });
});
