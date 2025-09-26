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

  it('creates new model with provided name', async () => {
    // Model doesn't exist
    mockExeca.mockRejectedValueOnce(new Error('not found'));

    // Prompts for model details
    mockInquirer.prompt
      .mockResolvedValueOnce({modelType: 'openai'})
      .mockResolvedValueOnce({
        modelVersion: 'gpt-4',
        baseUrl: 'https://api.openai.com/',
      })
      .mockResolvedValueOnce({apiKey: 'secret-key'});

    // Secret operations succeed
    mockExeca.mockResolvedValueOnce({}); // delete secret (may not exist)
    mockExeca.mockResolvedValueOnce({}); // create secret
    mockExeca.mockResolvedValueOnce({}); // apply model

    const result = await createModel('test-model');

    expect(result).toBe(true);
    expect(mockExeca).toHaveBeenCalledWith(
      'kubectl',
      ['get', 'model', 'test-model'],
      {stdio: 'pipe'}
    );
    expect(mockOutput.success).toHaveBeenCalledWith(
      'model test-model created successfully'
    );
  });

  it('prompts for name when not provided', async () => {
    mockInquirer.prompt
      .mockResolvedValueOnce({modelName: 'prompted-model'})
      .mockResolvedValueOnce({modelType: 'azure'})
      .mockResolvedValueOnce({
        modelVersion: 'gpt-4',
        baseUrl: 'https://azure.com',
      })
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
      .mockResolvedValueOnce({
        modelVersion: 'gpt-4',
        baseUrl: 'https://api.openai.com',
      })
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
      .mockResolvedValueOnce({
        modelVersion: 'gpt-4',
        baseUrl: 'https://api.openai.com',
      })
      .mockResolvedValueOnce({apiKey: 'secret'});

    mockExeca.mockRejectedValueOnce(new Error('delete failed')); // delete secret may fail
    mockExeca.mockRejectedValueOnce(new Error('secret creation failed')); // create secret fails

    const result = await createModel('test-model');

    expect(result).toBe(false);
    expect(mockOutput.error).toHaveBeenCalledWith('failed to create secret');
  });

  it('cleans up secret if model creation fails', async () => {
    mockExeca.mockRejectedValueOnce(new Error('not found')); // model doesn't exist

    mockInquirer.prompt
      .mockResolvedValueOnce({modelType: 'openai'})
      .mockResolvedValueOnce({
        modelVersion: 'gpt-4',
        baseUrl: 'https://api.openai.com',
      })
      .mockResolvedValueOnce({apiKey: 'secret'});

    mockExeca.mockResolvedValueOnce({}); // delete secret
    mockExeca.mockResolvedValueOnce({}); // create secret
    mockExeca.mockRejectedValueOnce(new Error('apply failed')); // apply model fails
    mockExeca.mockResolvedValueOnce({}); // cleanup secret

    const result = await createModel('test-model');

    expect(result).toBe(false);
    expect(mockOutput.error).toHaveBeenCalledWith('failed to create model');
    expect(mockExeca).toHaveBeenCalledWith(
      'kubectl',
      ['delete', 'secret', 'test-model-model-api-key'],
      {stdio: 'pipe'}
    );
  });
});
