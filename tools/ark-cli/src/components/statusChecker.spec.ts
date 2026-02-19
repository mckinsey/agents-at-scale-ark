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

    it('throws error when clientVersion field is missing', () => {
      const config = getKubectlVersion();
      const jsonOutput = JSON.stringify({serverVersion: {}});

      expect(() => config.versionExtract(jsonOutput)).toThrow(
        'kubectl version output missing clientVersion field'
      );
    });

    it('throws error for invalid JSON', () => {
      const config = getKubectlVersion();

      expect(() => config.versionExtract('not json')).toThrow(
        'Failed to parse kubectl version JSON'
      );
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
    });
  });
});
