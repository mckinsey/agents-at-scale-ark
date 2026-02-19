import {vi} from 'vitest';

const mockExeca = vi.fn() as any;
vi.mock('execa', () => ({
  execa: mockExeca,
}));

const mockCheckCommandExists = vi.fn();
vi.mock('../lib/commands.js', () => ({
  checkCommandExists: mockCheckCommandExists,
}));

vi.mock('../arkServices.js', () => ({
  arkServices: {},
}));

vi.mock('../lib/arkStatus.js', () => ({
  isArkReady: vi.fn().mockResolvedValue(false),
}));

const {
  getKubectlVersion,
  StatusChecker,
} = await import('./statusChecker.js');

describe('statusChecker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getKubectlVersion', () => {
    it('returns version config with correct extractor', () => {
      const config = getKubectlVersion();

      expect(config.command).toBe('kubectl');
      expect(config.versionArgs).toBe('version --client --output=json');
    });

    it('extracts version from valid JSON', () => {
      const config = getKubectlVersion();
      const jsonOutput = JSON.stringify({
        clientVersion: {major: '1', minor: '28'},
      });

      const version = config.versionExtract(jsonOutput);

      expect(version).toBe('v1.28');
    });

    it('throws error with cause for invalid JSON', () => {
      const config = getKubectlVersion();

      try {
        config.versionExtract('not json');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Failed to parse kubectl version JSON');
        expect((error as Error).cause).toBeDefined();
      }
    });

    it('throws error with cause when clientVersion missing', () => {
      const config = getKubectlVersion();
      const jsonOutput = JSON.stringify({serverVersion: {}});

      try {
        config.versionExtract(jsonOutput);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Failed to parse kubectl version JSON');
        expect((error as Error).cause).toBeInstanceOf(Error);
        expect(((error as Error).cause as Error).message).toBe(
          'kubectl version output missing clientVersion field'
        );
      }
    });
  });

  describe('StatusChecker', () => {
    let checker: InstanceType<typeof StatusChecker>;

    beforeEach(() => {
      checker = new StatusChecker();
    });

    describe('checkAll', () => {
      it('returns cluster access false when kubectl fails', async () => {
        mockCheckCommandExists.mockResolvedValue(false);
        mockExeca.mockRejectedValue(new Error('kubectl not found'));

        const result = await checker.checkAll();

        expect(result.clusterAccess).toBe(false);
        expect(result.services).toEqual([]);
      });

      it('returns dependencies status', async () => {
        mockCheckCommandExists.mockResolvedValue(false);
        mockExeca.mockRejectedValue(new Error('command not found'));

        const result = await checker.checkAll();

        expect(result.dependencies).toBeDefined();
        expect(result.dependencies.length).toBeGreaterThan(0);
      });

      it('handles kubectl namespace check failure gracefully', async () => {
        mockCheckCommandExists.mockResolvedValue(false);
        mockExeca.mockRejectedValue(new Error('kubectl: command not found'));

        const result = await checker.checkAll();

        expect(result.clusterAccess).toBe(false);
        expect(result.services).toEqual([]);
      });
    });
  });
});
