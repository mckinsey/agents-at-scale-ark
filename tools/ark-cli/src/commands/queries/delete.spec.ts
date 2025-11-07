import {jest} from '@jest/globals';

const mockExeca = jest.fn() as any;
jest.unstable_mockModule('execa', () => ({
  execa: mockExeca,
}));

const {createQueriesCommand} = await import('./index.js');
const {deleteQuery} = await import('./delete.js');
import output from '../../lib/output.js';

describe('queries delete command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    console.log = jest.fn();
    jest.spyOn(output, 'warning').mockImplementation(() => {});
    jest.spyOn(output, 'error').mockImplementation(() => {});
    jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('should delete a query by name', async () => {
    mockExeca.mockResolvedValue({
      stdout: '',
    });

    const command = createQueriesCommand({});
    await command.parseAsync(['node', 'test', 'delete', 'query-1']);

    expect(mockExeca).toHaveBeenCalledWith(
      'kubectl',
      ['delete', 'queries', 'query-1'],
      {stdio: 'pipe'}
    );
    expect(output.warning).not.toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('should delete all queries with --all flag', async () => {
    mockExeca.mockResolvedValue({
      stdout: '',
    });

    const command = createQueriesCommand({});
    await command.parseAsync(['node', 'test', 'delete', '--all']);

    expect(mockExeca).toHaveBeenCalledWith(
      'kubectl',
      ['delete', 'queries', '--all'],
      {stdio: 'pipe'}
    );
    expect(output.warning).not.toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
  });
});

describe('deleteQuery function', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(output, 'error').mockImplementation(() => {});
    jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('should error when neither name nor all flag is provided', async () => {
    await deleteQuery(undefined, {});

    expect(output.error).toHaveBeenCalledWith(
      'Either provide a query name or use --all flag'
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('should handle deletion errors gracefully', async () => {
    mockExeca.mockRejectedValue(new Error('query not found'));

    await deleteQuery('nonexistent-query', {});

    expect(output.error).toHaveBeenCalledWith(
      'deleting query:',
      'query not found'
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('should call deleteResource with query name', async () => {
    mockExeca.mockResolvedValue({
      stdout: '',
    });

    await deleteQuery('my-query', {});

    expect(mockExeca).toHaveBeenCalledWith(
      'kubectl',
      ['delete', 'queries', 'my-query'],
      {stdio: 'pipe'}
    );
  });

  it('should delete all queries when all option is true', async () => {
    mockExeca.mockResolvedValue({
      stdout: '',
    });

    await deleteQuery(undefined, {all: true});

    expect(mockExeca).toHaveBeenCalledWith(
      'kubectl',
      ['delete', 'queries', '--all'],
      {stdio: 'pipe'}
    );
  });
});
