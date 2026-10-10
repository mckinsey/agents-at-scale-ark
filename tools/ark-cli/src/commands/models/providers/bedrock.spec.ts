import {vi} from 'vitest';

const mockInquirer = {
  prompt: vi.fn() as any,
};
vi.mock('inquirer', () => ({
  default: mockInquirer,
}));

const {BedrockConfigCollector} = await import('./bedrock.js');

describe('BedrockConfigCollector', () => {
  let collector: InstanceType<typeof BedrockConfigCollector>;

  beforeEach(() => {
    collector = new BedrockConfigCollector();
    vi.clearAllMocks();
  });

  describe('collectConfig', () => {
    it('uses provided IAM options without prompting', async () => {
      const options = {
        model: 'anthropic.claude-3-sonnet-20240229-v1:0',
        region: 'us-west-2',
        authMethod: 'iam' as const,
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        sessionToken: 'session-token-123',
        modelArn: 'arn:aws:bedrock:us-west-2:123456789012:model/test',
      };

      const config = await collector.collectConfig(options);

      expect(mockInquirer.prompt).not.toHaveBeenCalled();
      expect(config).toEqual({
        type: 'bedrock',
        modelValue: 'anthropic.claude-3-sonnet-20240229-v1:0',
        secretName: '',
        region: 'us-west-2',
        authMethod: 'iam',
        apiKey: undefined,
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        sessionToken: 'session-token-123',
        modelArn: 'arn:aws:bedrock:us-west-2:123456789012:model/test',
      });
    });

    it('uses provided API-key options without prompting', async () => {
      const options = {
        model: 'anthropic.claude-v2',
        region: 'us-west-2',
        authMethod: 'api-key' as const,
        apiKey: 'bedrock-key-abc',
        modelArn: 'arn:aws:bedrock:us-west-2:123:model/claude',
      };

      const config = await collector.collectConfig(options);

      expect(mockInquirer.prompt).not.toHaveBeenCalled();
      expect(config).toEqual({
        type: 'bedrock',
        modelValue: 'anthropic.claude-v2',
        secretName: '',
        region: 'us-west-2',
        authMethod: 'api-key',
        apiKey: 'bedrock-key-abc',
        accessKeyId: undefined,
        secretAccessKey: undefined,
        sessionToken: undefined,
        modelArn: 'arn:aws:bedrock:us-west-2:123:model/claude',
      });
    });

    it('prompts for missing region with default', async () => {
      mockInquirer.prompt.mockResolvedValueOnce({region: 'us-east-1'});
      mockInquirer.prompt.mockResolvedValueOnce({apiKey: 'key'});
      mockInquirer.prompt.mockResolvedValueOnce({modelArn: ''});

      const options = {
        model: 'test-model',
        authMethod: 'api-key' as const,
      };

      const config = await collector.collectConfig(options);

      expect(mockInquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'input',
          name: 'region',
          message: 'AWS region:',
          default: 'us-east-1',
        }),
      ]);
      expect(config.region).toBe('us-east-1');
    });

    it('throws error if region is missing after prompt', async () => {
      mockInquirer.prompt.mockResolvedValueOnce({region: ''});

      const options = {
        model: 'test-model',
      };

      await expect(collector.collectConfig(options)).rejects.toThrow(
        'region is required'
      );
    });

    it('prompts for auth method when not provided', async () => {
      mockInquirer.prompt.mockResolvedValueOnce({authMethod: 'iam'});
      mockInquirer.prompt.mockResolvedValueOnce({accessKeyId: 'AKIATEST'});
      mockInquirer.prompt.mockResolvedValueOnce({secretAccessKey: 'secret'});
      mockInquirer.prompt.mockResolvedValueOnce({sessionToken: ''});
      mockInquirer.prompt.mockResolvedValueOnce({modelArn: ''});

      const options = {
        model: 'test-model',
        region: 'us-west-2',
      };

      const config = await collector.collectConfig(options);

      expect(mockInquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'list',
          name: 'authMethod',
          message: 'Authentication method:',
        }),
      ]);
      expect(config.authMethod).toBe('iam');
    });

    it('prompts for missing accessKeyId', async () => {
      mockInquirer.prompt.mockResolvedValueOnce({
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      });
      mockInquirer.prompt.mockResolvedValueOnce({secretAccessKey: 'secret'});
      mockInquirer.prompt.mockResolvedValueOnce({sessionToken: ''});
      mockInquirer.prompt.mockResolvedValueOnce({modelArn: ''});

      const options = {
        model: 'test-model',
        region: 'us-west-2',
        authMethod: 'iam' as const,
      };

      const config = await collector.collectConfig(options);

      expect(mockInquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'input',
          name: 'accessKeyId',
          message: 'AWS access key ID:',
          validate: expect.any(Function),
        }),
      ]);
      expect(config.accessKeyId).toBe('AKIAIOSFODNN7EXAMPLE');
    });

    it('validates accessKeyId is required', async () => {
      mockInquirer.prompt.mockResolvedValueOnce({accessKeyId: ''});

      const options = {
        model: 'test-model',
        region: 'us-west-2',
        authMethod: 'iam' as const,
      };

      await expect(collector.collectConfig(options)).rejects.toThrow(
        'access key ID is required'
      );
    });

    it('prompts for missing secretAccessKey as password field', async () => {
      mockInquirer.prompt.mockResolvedValueOnce({
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      });
      mockInquirer.prompt.mockResolvedValueOnce({sessionToken: ''});
      mockInquirer.prompt.mockResolvedValueOnce({modelArn: ''});

      const options = {
        model: 'test-model',
        region: 'us-west-2',
        authMethod: 'iam' as const,
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      };

      const config = await collector.collectConfig(options);

      expect(mockInquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'password',
          name: 'secretAccessKey',
          message: 'AWS secret access key:',
          mask: '*',
          validate: expect.any(Function),
        }),
      ]);
      expect(config.secretAccessKey).toBe(
        'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
      );
    });

    it('validates secretAccessKey is required', async () => {
      mockInquirer.prompt.mockResolvedValueOnce({secretAccessKey: ''});

      const options = {
        model: 'test-model',
        region: 'us-west-2',
        authMethod: 'iam' as const,
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      };

      await expect(collector.collectConfig(options)).rejects.toThrow(
        'secret access key is required'
      );
    });

    it('prompts for the API key when auth method is api-key', async () => {
      mockInquirer.prompt.mockResolvedValueOnce({apiKey: 'bedrock-key-xyz'});
      mockInquirer.prompt.mockResolvedValueOnce({modelArn: ''});

      const options = {
        model: 'test-model',
        region: 'us-west-2',
        authMethod: 'api-key' as const,
      };

      const config = await collector.collectConfig(options);

      expect(mockInquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'password',
          name: 'apiKey',
          message: 'Bedrock API key:',
          mask: '*',
          validate: expect.any(Function),
        }),
      ]);
      expect(config.apiKey).toBe('bedrock-key-xyz');
      expect(config.accessKeyId).toBeUndefined();
      expect(config.secretAccessKey).toBeUndefined();
    });

    it('validates API key is required', async () => {
      mockInquirer.prompt.mockResolvedValueOnce({apiKey: ''});

      const options = {
        model: 'test-model',
        region: 'us-west-2',
        authMethod: 'api-key' as const,
      };

      await expect(collector.collectConfig(options)).rejects.toThrow(
        'API key is required'
      );
    });

    it('prompts for optional sessionToken', async () => {
      mockInquirer.prompt.mockResolvedValueOnce({
        sessionToken: 'optional-token',
      });
      mockInquirer.prompt.mockResolvedValueOnce({modelArn: ''});

      const options = {
        model: 'test-model',
        region: 'us-west-2',
        authMethod: 'iam' as const,
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      };

      const config = await collector.collectConfig(options);

      expect(mockInquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'password',
          name: 'sessionToken',
          message: 'AWS session token (optional, press enter to skip):',
          mask: '*',
        }),
      ]);
      expect(config.sessionToken).toBe('optional-token');
    });

    it('sets sessionToken to undefined when empty', async () => {
      mockInquirer.prompt.mockResolvedValueOnce({sessionToken: ''});
      mockInquirer.prompt.mockResolvedValueOnce({modelArn: ''});

      const options = {
        model: 'test-model',
        region: 'us-west-2',
        authMethod: 'iam' as const,
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      };

      const config = await collector.collectConfig(options);

      expect(config.sessionToken).toBeUndefined();
    });

    it('prompts for optional modelArn', async () => {
      mockInquirer.prompt.mockResolvedValueOnce({sessionToken: ''});
      mockInquirer.prompt.mockResolvedValueOnce({
        modelArn: 'arn:aws:bedrock:us-west-2:123456789012:model/test',
      });

      const options = {
        model: 'test-model',
        region: 'us-west-2',
        authMethod: 'iam' as const,
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      };

      const config = await collector.collectConfig(options);

      expect(mockInquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          type: 'input',
          name: 'modelArn',
          message: 'Model ARN (optional, press enter to skip):',
        }),
      ]);
      expect(config.modelArn).toBe(
        'arn:aws:bedrock:us-west-2:123456789012:model/test'
      );
    });

    it('sets modelArn to undefined when empty', async () => {
      mockInquirer.prompt.mockResolvedValueOnce({sessionToken: ''});
      mockInquirer.prompt.mockResolvedValueOnce({modelArn: ''});

      const options = {
        model: 'test-model',
        region: 'us-west-2',
        authMethod: 'iam' as const,
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      };

      const config = await collector.collectConfig(options);

      expect(config.modelArn).toBeUndefined();
    });

    it('collects full IAM configuration through interactive prompts', async () => {
      mockInquirer.prompt.mockResolvedValueOnce({region: 'eu-west-1'});
      mockInquirer.prompt.mockResolvedValueOnce({authMethod: 'iam'});
      mockInquirer.prompt.mockResolvedValueOnce({accessKeyId: 'AKIATEST'});
      mockInquirer.prompt.mockResolvedValueOnce({secretAccessKey: 'secret123'});
      mockInquirer.prompt.mockResolvedValueOnce({sessionToken: 'token456'});
      mockInquirer.prompt.mockResolvedValueOnce({
        modelArn: 'arn:aws:bedrock:eu-west-1:123:model/claude',
      });

      const options = {
        model: 'anthropic.claude-v2',
      };

      const config = await collector.collectConfig(options);

      expect(config).toEqual({
        type: 'bedrock',
        modelValue: 'anthropic.claude-v2',
        secretName: '',
        region: 'eu-west-1',
        authMethod: 'iam',
        apiKey: undefined,
        accessKeyId: 'AKIATEST',
        secretAccessKey: 'secret123',
        sessionToken: 'token456',
        modelArn: 'arn:aws:bedrock:eu-west-1:123:model/claude',
      });
    });

    it('collects full API-key configuration through interactive prompts', async () => {
      mockInquirer.prompt.mockResolvedValueOnce({region: 'eu-west-1'});
      mockInquirer.prompt.mockResolvedValueOnce({authMethod: 'api-key'});
      mockInquirer.prompt.mockResolvedValueOnce({apiKey: 'bedrock-key-123'}); // gitleaks:allow
      mockInquirer.prompt.mockResolvedValueOnce({modelArn: ''});

      const options = {
        model: 'anthropic.claude-v2',
      };

      const config = await collector.collectConfig(options);

      expect(config).toEqual({
        type: 'bedrock',
        modelValue: 'anthropic.claude-v2',
        secretName: '',
        region: 'eu-west-1',
        authMethod: 'api-key',
        apiKey: 'bedrock-key-123', // gitleaks:allow
        accessKeyId: undefined,
        secretAccessKey: undefined,
        sessionToken: undefined,
        modelArn: undefined,
      });
    });

    it('mixes CLI options and interactive prompts', async () => {
      mockInquirer.prompt.mockResolvedValueOnce({
        accessKeyId: 'AKIAPROMPTED',
      });
      mockInquirer.prompt.mockResolvedValueOnce({sessionToken: ''});
      mockInquirer.prompt.mockResolvedValueOnce({modelArn: ''});

      const options = {
        model: 'test-model',
        region: 'ap-south-1',
        authMethod: 'iam' as const,
        secretAccessKey: 'providedSecret',
      };

      const config = await collector.collectConfig(options);

      expect(config).toEqual({
        type: 'bedrock',
        modelValue: 'test-model',
        secretName: '',
        region: 'ap-south-1',
        authMethod: 'iam',
        apiKey: undefined,
        accessKeyId: 'AKIAPROMPTED',
        secretAccessKey: 'providedSecret',
        sessionToken: undefined,
        modelArn: undefined,
      });
    });
  });
});
