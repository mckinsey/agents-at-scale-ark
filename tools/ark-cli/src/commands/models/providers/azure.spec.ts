import {jest} from '@jest/globals';

const mockInquirer = {
  prompt: jest.fn() as any,
};
jest.unstable_mockModule('inquirer', () => ({
  default: mockInquirer,
}));

const {AzureConfigCollector} = await import('./azure.js');

describe('AzureConfigCollector', () => {
  let collector: InstanceType<typeof AzureConfigCollector>;

  beforeEach(() => {
    collector = new AzureConfigCollector();
    jest.clearAllMocks();
  });

  describe('collectConfig', () => {
    it('uses provided options without prompting', async () => {
      const options = {
        model: 'gpt-4o-mini',
        baseUrl: 'https://my-resource.openai.azure.com',
        apiKey: 'azure-key-12345',
        apiVersion: '2024-12-01-preview',
      };

      const config = await collector.collectConfig(options);

      expect(mockInquirer.prompt).not.toHaveBeenCalled();
      expect(config).toEqual({
        type: 'azure',
        modelValue: 'gpt-4o-mini',
        secretName: '',
        baseUrl: 'https://my-resource.openai.azure.com',
        apiKey: 'azure-key-12345',
        apiVersion: '2024-12-01-preview',
      });
    });

    it('uses default apiVersion when not provided', async () => {
      mockInquirer.prompt.mockResolvedValueOnce({
        apiVersion: '2024-12-01-preview',
      });
      mockInquirer.prompt.mockResolvedValueOnce({apiKey: 'azure-key'});

      const options = {
        model: 'gpt-4',
        baseUrl: 'https://my-resource.openai.azure.com',
      };

      const config = await collector.collectConfig(options);

      expect(mockInquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'input',
          name: 'apiVersion',
          message: 'Azure API version:',
          default: '2024-12-01-preview',
        }),
      ]);
      expect(config.apiVersion).toBe('2024-12-01-preview');
    });

    it('prompts for missing baseUrl', async () => {
      mockInquirer.prompt.mockResolvedValueOnce({
        baseUrl: 'https://contoso.openai.azure.com',
      });
      mockInquirer.prompt.mockResolvedValueOnce({apiVersion: '2024-10-01'});
      mockInquirer.prompt.mockResolvedValueOnce({apiKey: 'azure-key'});

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
      expect(config.baseUrl).toBe('https://contoso.openai.azure.com');
    });

    it('validates baseUrl is required', async () => {
      mockInquirer.prompt.mockResolvedValueOnce({baseUrl: ''});

      const options = {
        model: 'gpt-4',
      };

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
        expect(validate('https://test.openai.azure.com')).toBe(true);

        return {baseUrl: 'https://test.openai.azure.com'};
      });

      mockInquirer.prompt.mockResolvedValueOnce({
        apiVersion: '2024-12-01-preview',
      });
      mockInquirer.prompt.mockResolvedValueOnce({apiKey: 'azure-key'});

      await collector.collectConfig(options);
    });

    it('removes trailing slash from baseUrl', async () => {
      const options = {
        model: 'gpt-4',
        baseUrl: 'https://my-resource.openai.azure.com/',
        apiKey: 'azure-key',
        apiVersion: '2024-12-01-preview',
      };

      const config = await collector.collectConfig(options);

      expect(config.baseUrl).toBe('https://my-resource.openai.azure.com');
    });

    it('prompts for missing apiKey as password field', async () => {
      mockInquirer.prompt.mockResolvedValueOnce({
        apiKey: 'azure-secret-key',
      });

      const options = {
        model: 'gpt-4',
        baseUrl: 'https://my-resource.openai.azure.com',
        apiVersion: '2024-12-01-preview',
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
      expect(config.apiKey).toBe('azure-secret-key');
    });

    it('validates apiKey is required', async () => {
      mockInquirer.prompt.mockResolvedValueOnce({apiKey: ''});

      const options = {
        model: 'gpt-4',
        baseUrl: 'https://my-resource.openai.azure.com',
        apiVersion: '2024-12-01-preview',
      };

      await expect(collector.collectConfig(options)).rejects.toThrow(
        'API key is required'
      );
    });

    it('tests apiKey validation function', async () => {
      const options = {
        model: 'gpt-4',
        baseUrl: 'https://my-resource.openai.azure.com',
        apiVersion: '2024-12-01-preview',
      };

      // Get the validate function from the prompt call
      mockInquirer.prompt.mockImplementationOnce(async (questions: any) => {
        const validate = questions[0].validate;

        // Test empty string
        expect(validate('')).toBe('API key is required');

        // Test valid key
        expect(validate('valid-azure-key')).toBe(true);

        return {apiKey: 'valid-azure-key'};
      });

      await collector.collectConfig(options);
    });

    it('collects full configuration through interactive prompts', async () => {
      mockInquirer.prompt.mockResolvedValueOnce({
        baseUrl: 'https://eastus.openai.azure.com/',
      });
      mockInquirer.prompt.mockResolvedValueOnce({
        apiVersion: '2024-08-01-preview',
      });
      mockInquirer.prompt.mockResolvedValueOnce({
        apiKey: 'abc123def456',
      });

      const options = {
        model: 'gpt-4o',
      };

      const config = await collector.collectConfig(options);

      expect(config).toEqual({
        type: 'azure',
        modelValue: 'gpt-4o',
        secretName: '',
        baseUrl: 'https://eastus.openai.azure.com',
        apiKey: 'abc123def456',
        apiVersion: '2024-08-01-preview',
      });
    });

    it('mixes CLI options and interactive prompts', async () => {
      mockInquirer.prompt.mockResolvedValueOnce({
        apiKey: 'prompted-key',
      });

      const options = {
        model: 'gpt-35-turbo',
        baseUrl: 'https://westeurope.openai.azure.com',
        apiVersion: '2024-06-01',
      };

      const config = await collector.collectConfig(options);

      expect(config).toEqual({
        type: 'azure',
        modelValue: 'gpt-35-turbo',
        secretName: '',
        baseUrl: 'https://westeurope.openai.azure.com',
        apiKey: 'prompted-key',
        apiVersion: '2024-06-01',
      });
    });

    it('accepts custom apiVersion', async () => {
      const options = {
        model: 'gpt-4',
        baseUrl: 'https://my-resource.openai.azure.com',
        apiKey: 'azure-key',
        apiVersion: '2023-05-15',
      };

      const config = await collector.collectConfig(options);

      expect(config.apiVersion).toBe('2023-05-15');
    });

    it('prompts for apiVersion when only baseUrl is provided', async () => {
      mockInquirer.prompt.mockResolvedValueOnce({
        apiVersion: '2024-12-01-preview',
      });
      mockInquirer.prompt.mockResolvedValueOnce({apiKey: 'azure-key'});

      const options = {
        model: 'gpt-4',
        baseUrl: 'https://my-resource.openai.azure.com',
      };

      const config = await collector.collectConfig(options);

      expect(mockInquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'input',
          name: 'apiVersion',
          message: 'Azure API version:',
          default: '2024-12-01-preview',
        }),
      ]);
      expect(config.apiVersion).toBe('2024-12-01-preview');
    });
  });
});
