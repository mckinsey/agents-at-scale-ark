import {jest} from '@jest/globals';

const mockExeca = jest.fn() as any;
jest.unstable_mockModule('execa', () => ({
  execa: mockExeca,
}));

const mockInquirer = {
  prompt: jest.fn() as any,
};
jest.unstable_mockModule('inquirer', () => ({
  default: mockInquirer,
}));

const mockOutput = {
  info: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
};
jest.unstable_mockModule('../../lib/output.js', () => ({
  default: mockOutput,
}));

jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

const {createModel} = await import('./create.js');

describe('createModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates new model for type aws bedrock', async () => {
    mockExeca.mockRejectedValueOnce(new Error('not found')); // model doesn't exist

    mockInquirer.prompt
      .mockResolvedValueOnce({modelType: 'bedrock'}) // user selects from list
      .mockResolvedValueOnce({model: 'anthropic.claude-3-sonnet-20240229-v1:0'})
      .mockResolvedValueOnce({region: 'us-east-1'})
      .mockResolvedValueOnce({accessKeyId: 'AKIAIOSFODNN7EXAMPLE'})
      .mockResolvedValueOnce({
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      })
      .mockResolvedValueOnce({sessionToken: 'optional-session-token'})
      .mockResolvedValueOnce({
        modelArn:
          'arn:aws:bedrock:us-east-1:123456789012:model/anthropic.claude-3-sonnet-20240229-v1:0',
      });

    mockExeca.mockResolvedValue({}); // kubectl ops succeed

    await createModel('test-model');

    // Verify that model type prompt was called
    expect(mockInquirer.prompt).toHaveBeenCalledWith([
      expect.objectContaining({
        type: 'list',
        name: 'modelType',
        message: 'select model provider:',
        choices: expect.arrayContaining([
          {name: 'Azure OpenAI', value: 'azure'},
          {name: 'OpenAI', value: 'openai'},
          {name: 'AWS Bedrock', value: 'bedrock'},
        ]),
      }),
    ]);

    // Verify Bedrock-specific prompts were called
    expect(mockInquirer.prompt).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'region',
        message: 'AWS region:',
      }),
    ]);

    expect(mockInquirer.prompt).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'accessKeyId',
        message: 'AWS access key ID:',
      }),
    ]);

    expect(mockInquirer.prompt).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'secretAccessKey',
        message: 'AWS secret access key:',
        type: 'password',
      }),
    ]);

    expect(mockOutput.success).toHaveBeenCalledWith('model test-model created');
  });

  it('creates new model with provided name', async () => {
    // Model doesn't exist
    mockExeca.mockRejectedValueOnce(new Error('not found'));

    // Prompts for model details
    mockInquirer.prompt
      .mockResolvedValueOnce({modelType: 'openai'})
      .mockResolvedValueOnce({model: 'gpt-4'})
      .mockResolvedValueOnce({baseUrl: 'https://api.openai.com/'})
      .mockResolvedValueOnce({apiKey: 'secret-key'});

    // Secret operations succeed
    mockExeca.mockResolvedValueOnce({}); // create secret
    mockExeca.mockResolvedValueOnce({}); // apply model

    const result = await createModel('test-model');

    expect(result).toBe(true);
    expect(mockExeca).toHaveBeenCalledWith(
      'kubectl',
      ['get', 'model', 'test-model'],
      {stdio: 'pipe'}
    );
    expect(mockOutput.success).toHaveBeenCalledWith('model test-model created');
  });

  it('prompts for name when not provided', async () => {
    mockInquirer.prompt
      .mockResolvedValueOnce({modelName: 'prompted-model'})
      .mockResolvedValueOnce({modelType: 'azure'})
      .mockResolvedValueOnce({model: 'gpt-4'})
      .mockResolvedValueOnce({baseUrl: 'https://azure.com'})
      .mockResolvedValueOnce({apiVersion: '2024-12-01'})
      .mockResolvedValueOnce({apiKey: 'secret'});

    mockExeca.mockRejectedValueOnce(new Error('not found')); // model doesn't exist
    mockExeca.mockResolvedValue({}); // all kubectl ops succeed

    const result = await createModel();

    expect(result).toBe(true);
    expect(mockInquirer.prompt).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'modelName',
        message: 'model name:',
      }),
    ]);
  });

  it('handles overwrite confirmation when model exists', async () => {
    // Model exists
    mockExeca.mockResolvedValueOnce({});

    mockInquirer.prompt
      .mockResolvedValueOnce({overwrite: true})
      .mockResolvedValueOnce({modelType: 'openai'})
      .mockResolvedValueOnce({model: 'gpt-4'})
      .mockResolvedValueOnce({baseUrl: 'https://api.openai.com'})
      .mockResolvedValueOnce({apiKey: 'secret'});

    mockExeca.mockResolvedValue({}); // remaining kubectl ops

    const result = await createModel('existing-model');

    expect(result).toBe(true);
    expect(mockOutput.warning).toHaveBeenCalledWith(
      'model existing-model already exists'
    );
  });

  it('cancels when user declines overwrite', async () => {
    mockExeca.mockResolvedValueOnce({}); // model exists
    mockInquirer.prompt.mockResolvedValueOnce({overwrite: false});

    const result = await createModel('existing-model');

    expect(result).toBe(false);
    expect(mockOutput.info).toHaveBeenCalledWith('model creation cancelled');
  });

  it('handles secret creation failure', async () => {
    mockExeca.mockRejectedValueOnce(new Error('not found')); // model doesn't exist

    mockInquirer.prompt
      .mockResolvedValueOnce({modelType: 'openai'})
      .mockResolvedValueOnce({model: 'gpt-4'})
      .mockResolvedValueOnce({baseUrl: 'https://api.openai.com'})
      .mockResolvedValueOnce({apiKey: 'secret'});

    mockExeca.mockRejectedValueOnce(new Error('secret creation failed')); // create secret fails

    const result = await createModel('test-model');

    expect(result).toBe(false);
    expect(mockOutput.error).toHaveBeenCalledWith('failed to create secret');
  });
});
