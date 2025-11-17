import {jest} from '@jest/globals';

import {UNSUPPORTED_OUTPUT_FORMAT_MESSAGE} from './validation.js';
import output from '../../lib/output.js';

const mockExeca = jest.fn() as any;
jest.unstable_mockModule('execa', () => ({
  execa: mockExeca,
}));

const {createQueriesCommand} = await import('./index.js');

describe('queries list command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    console.log = jest.fn();
    jest.spyOn(output, 'warning').mockImplementation(() => {});
    jest.spyOn(output, 'error').mockImplementation(() => {});
    jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('should list all queries in text format by default', async () => {
    const mockQueries = [
      {
        metadata: {
          name: 'query-1',
          creationTimestamp: '2024-01-01T00:00:00Z',
        },
        status: {
          phase: 'done',
        },
      },
      {
        metadata: {
          name: 'query-2',
          creationTimestamp: '2024-01-02T00:00:00Z',
        },
        status: {
          phase: 'running',
        },
      },
    ];

    mockExeca.mockResolvedValue({
      stdout: JSON.stringify({items: mockQueries}),
    });

    const command = createQueriesCommand({});
    await command.parseAsync(['node', 'test', 'list']);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringMatching(/NAME.*STATUS/)
    );

    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/query-1/));
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/query-2/));

    expect(mockExeca).toHaveBeenCalledWith(
      'kubectl',
      ['get', 'queries', '-o', 'json'],
      {stdio: 'pipe'}
    );
  });

  it('should list all queries in JSON format', async () => {
    const mockQueries = [
      {
        metadata: {
          name: 'query-1',
          creationTimestamp: '2024-01-01T00:00:00Z',
        },
      },
      {
        metadata: {
          name: 'query-2',
          creationTimestamp: '2024-01-02T00:00:00Z',
        },
      },
    ];

    mockExeca.mockResolvedValue({
      stdout: JSON.stringify({items: mockQueries}),
    });

    const command = createQueriesCommand({});
    await command.parseAsync(['node', 'test', '--output', 'json']);

    expect(console.log).toHaveBeenCalledWith(
      JSON.stringify(mockQueries, null, 2)
    );
    expect(mockExeca).toHaveBeenCalledWith(
      'kubectl',
      ['get', 'queries', '-o', 'json'],
      {stdio: 'pipe'}
    );
  });

  it('should support sorting by creation timestamp', async () => {
    const mockQueries = [
      {
        metadata: {
          name: 'query-1',
          creationTimestamp: '2024-01-01T00:00:00Z',
        },
        status: {
          phase: 'done',
        },
      },
      {
        metadata: {
          name: 'query-2',
          creationTimestamp: '2024-01-02T00:00:00Z',
        },
        status: {
          phase: 'running',
        },
      },
    ];

    mockExeca.mockResolvedValue({
      stdout: JSON.stringify({items: mockQueries}),
    });

    const command = createQueriesCommand({});
    await command.parseAsync([
      'node',
      'test',
      '--sort-by',
      '.metadata.creationTimestamp',
    ]);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringMatching(/NAME.*STATUS/)
    );

    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/query-1/));
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/query-2/));

    expect(mockExeca).toHaveBeenCalledWith(
      'kubectl',
      ['get', 'queries', '--sort-by=.metadata.creationTimestamp', '-o', 'json'],
      {stdio: 'pipe'}
    );
  });

  it('should display warning when no queries exist', async () => {
    mockExeca.mockResolvedValue({
      stdout: JSON.stringify({items: []}),
    });

    const command = createQueriesCommand({});
    await command.parseAsync(['node', 'test', 'list']);

    expect(output.warning).toHaveBeenCalledWith('no queries available');
    expect(mockExeca).toHaveBeenCalledWith(
      'kubectl',
      ['get', 'queries', '-o', 'json'],
      {stdio: 'pipe'}
    );
  });

  it('should handle errors when listing queries', async () => {
    mockExeca.mockRejectedValue(new Error('kubectl connection failed'));

    const command = createQueriesCommand({});
    await command.parseAsync(['node', 'test', 'list']);

    expect(output.error).toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalled();
  });

  it('should handle invalid output format gracefully', async () => {
    const mockQueries = [
      {
        metadata: {
          name: 'query-1',
          creationTimestamp: '2024-01-01T00:00:00Z',
        },
        status: {
          phase: 'done',
        },
      },
    ];

    mockExeca.mockResolvedValue({
      stdout: JSON.stringify({items: mockQueries}),
    });

    const command = createQueriesCommand({});
    await command.parseAsync(['node', 'test', '--output', 'xml']);

    expect(output.error).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(UNSUPPORTED_OUTPUT_FORMAT_MESSAGE)
    );

    expect(mockExeca).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalledWith(
      expect.stringMatching(/query-1/)
    );
    expect(process.exit).toHaveBeenCalled();
  });

  it('should list many queries without truncation', async () => {
    // Create 100 mock queries
    const mockQueries = Array.from({length: 100}, (_, i) => ({
      metadata: {
        name: `query-${i + 1}`,
        creationTimestamp: new Date(2024, 0, i + 1).toISOString(),
      },
      status: {
        phase: i % 3 === 0 ? 'done' : i % 2 === 0 ? 'running' : 'initializing',
      },
    }));

    mockExeca.mockResolvedValue({
      stdout: JSON.stringify({items: mockQueries}),
    });

    const command = createQueriesCommand({});
    await command.parseAsync(['node', 'test', 'list']);

    // Check for header and separator
    expect(console.log).toHaveBeenCalledWith(
      expect.stringMatching(/NAME.*STATUS/)
    );

    // Verify all queries are logged
    for (let i = 1; i <= 100; i++) {
      expect(console.log).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`query-${i}`))
      );
    }

    // Verify console.log was called: header + 100 queries
    expect(console.log).toHaveBeenCalledTimes(101);
  });
});
