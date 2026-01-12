import {jest} from '@jest/globals';

import output from '../../lib/output.js';

const mockExeca = jest.fn() as any;
jest.unstable_mockModule('execa', () => ({
  execa: mockExeca,
}));

const {createQueriesCommand} = await import('./index.js');

describe('queries get command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    console.log = jest.fn();
    jest.spyOn(output, 'warning').mockImplementation(() => {});
    jest.spyOn(output, 'error').mockImplementation(() => {});
    jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('should get query with response in JSON format', async () => {
    const mockQuery = {
      metadata: {
        name: 'test-query',
      },
      spec: {
        input: 'test input',
        target: {type: 'agent', name: 'test-agent'},
      },
      status: {
        phase: 'done',
        response: {
          content: 'This is the response',
        },
      },
    };

    mockExeca.mockResolvedValue({
      stdout: JSON.stringify(mockQuery),
    });

    const command = createQueriesCommand({});
    await command.parseAsync(['node', 'test', 'get', 'test-query']);

    expect(console.log).toHaveBeenCalledWith(
      JSON.stringify(mockQuery, null, 2)
    );
    expect(mockExeca).toHaveBeenCalledWith(
      'kubectl',
      ['get', 'queries', 'test-query', '-o', 'json'],
      {stdio: 'pipe'}
    );
  });

  it('should get query with response flag in JSON format', async () => {
    const mockQuery = {
      metadata: {
        name: 'test-query',
      },
      spec: {
        input: 'test input',
        target: {type: 'agent', name: 'test-agent'},
      },
      status: {
        phase: 'done',
        response: {
          content: 'This is the response content',
        },
      },
    };

    mockExeca.mockResolvedValue({
      stdout: JSON.stringify(mockQuery),
    });

    const command = createQueriesCommand({});
    await command.parseAsync([
      'node',
      'test',
      'get',
      'test-query',
      '--response',
    ]);

    expect(console.log).toHaveBeenCalledWith(
      JSON.stringify(mockQuery.status.response, null, 2)
    );
    expect(mockExeca).toHaveBeenCalledWith(
      'kubectl',
      ['get', 'queries', 'test-query', '-o', 'json'],
      {stdio: 'pipe'}
    );
  });

  it('should get query with response flag in markdown format', async () => {
    const mockQuery = {
      metadata: {
        name: 'test-query',
      },
      spec: {
        input: 'test input',
        target: {type: 'agent', name: 'test-agent'},
      },
      status: {
        phase: 'done',
        response: {
          content: '# Heading\n\nThis is markdown content',
        },
      },
    };

    mockExeca.mockResolvedValue({
      stdout: JSON.stringify(mockQuery),
    });

    const command = createQueriesCommand({});
    await command.parseAsync([
      'node',
      'test',
      'get',
      'test-query',
      '--response',
      '--output',
      'markdown',
    ]);

    expect(console.log).toHaveBeenCalled();
    expect(mockExeca).toHaveBeenCalledWith(
      'kubectl',
      ['get', 'queries', 'test-query', '-o', 'json'],
      {stdio: 'pipe'}
    );
  });

  it('should get query in markdown format without response flag', async () => {
    const mockQuery = {
      metadata: {
        name: 'test-query',
      },
      spec: {
        input: 'test input',
        target: {type: 'agent', name: 'test-agent'},
      },
      status: {
        phase: 'done',
        response: {
          content: '# Response\n\nMarkdown response',
        },
      },
    };

    mockExeca.mockResolvedValue({
      stdout: JSON.stringify(mockQuery),
    });

    const command = createQueriesCommand({});
    await command.parseAsync([
      'node',
      'test',
      'get',
      'test-query',
      '--output',
      'markdown',
    ]);

    expect(console.log).toHaveBeenCalled();
    expect(mockExeca).toHaveBeenCalledWith(
      'kubectl',
      ['get', 'queries', 'test-query', '-o', 'json'],
      {stdio: 'pipe'}
    );
  });

  it('should warn when query has no response with response flag', async () => {
    const mockQuery = {
      metadata: {
        name: 'test-query',
      },
      spec: {
        input: 'test input',
        target: {type: 'agent', name: 'test-agent'},
      },
      status: {
        phase: 'running',
      },
    };

    mockExeca.mockResolvedValue({
      stdout: JSON.stringify(mockQuery),
    });

    const command = createQueriesCommand({});
    await command.parseAsync([
      'node',
      'test',
      'get',
      'test-query',
      '--response',
    ]);

    expect(output.warning).toHaveBeenCalledWith('No response available');
    expect(mockExeca).toHaveBeenCalledWith(
      'kubectl',
      ['get', 'queries', 'test-query', '-o', 'json'],
      {stdio: 'pipe'}
    );
  });

  it('should handle errors when getting query', async () => {
    mockExeca.mockRejectedValue(new Error('Query not found'));

    const command = createQueriesCommand({});
    await command.parseAsync(['node', 'test', 'get', 'nonexistent-query']);

    expect(output.error).toHaveBeenCalledWith(
      'fetching query:',
      'Query not found'
    );
    expect(process.exit).toHaveBeenCalled();
  });
});
