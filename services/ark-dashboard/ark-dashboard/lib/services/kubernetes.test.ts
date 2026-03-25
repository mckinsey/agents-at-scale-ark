import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkLabeledDeployment } from '@/lib/services/kubernetes'

const mockGet = vi.fn();

vi.mock('@/lib/api/client', () => ({
  APIClient: vi.fn().mockImplementation(() => ({
    get: mockGet,
  })),
}))

describe('kubernetes service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('checkLabeledDeployment', () => {
    it('returns true when deployment exists and is available', async () => {
      mockGet.mockResolvedValueOnce({
        apiVersion: 'apps/v1',
        kind: 'DeploymentList',
        items: [
          {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            metadata: {
              name: 'phoenix-deployment',
              namespace: 'phoenix',
              labels: {
                'ark.mckinsey.com/marketplace-item': 'phoenix',
              },
            },
            status: {
              conditions: [
                {
                  type: 'Available',
                  status: 'True',
                  lastTransitionTime: '2024-01-01T00:00:00Z',
                },
              ],
            },
          },
        ],
      })

      const result = await checkLabeledDeployment('phoenix', 'phoenix')

      expect(result).toBe(true)
      expect(mockGet).toHaveBeenCalledWith(
        '/v1/resources/apis/apps/v1/Deployment?namespace=phoenix&labelSelector=ark.mckinsey.com%2Fmarketplace-item%3Dphoenix'
      )
    })

    it('returns false when deployment exists but is not available', async () => {
      mockGet.mockResolvedValueOnce({
        apiVersion: 'apps/v1',
        kind: 'DeploymentList',
        items: [
          {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            metadata: {
              name: 'phoenix-deployment',
              namespace: 'phoenix',
            },
            status: {
              conditions: [
                {
                  type: 'Available',
                  status: 'False',
                  reason: 'MinimumReplicasUnavailable',
                },
              ],
            },
          },
        ],
      })

      const result = await checkLabeledDeployment('phoenix', 'phoenix')

      expect(result).toBe(false)
    })

    it('returns false when deployment exists but has no conditions', async () => {
      mockGet.mockResolvedValueOnce({
        apiVersion: 'apps/v1',
        kind: 'DeploymentList',
        items: [
          {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            metadata: {
              name: 'phoenix-deployment',
              namespace: 'phoenix',
            },
            status: {},
          },
        ],
      })

      const result = await checkLabeledDeployment('phoenix', 'phoenix')

      expect(result).toBe(false)
    })

    it('returns false when no deployments are found', async () => {
      mockGet.mockResolvedValueOnce({
        apiVersion: 'apps/v1',
        kind: 'DeploymentList',
        items: [],
      })

      const result = await checkLabeledDeployment('phoenix', 'phoenix')

      expect(result).toBe(false)
    })

    it('returns false when items array is missing', async () => {
      mockGet.mockResolvedValueOnce({
        apiVersion: 'apps/v1',
        kind: 'DeploymentList',
      })

      const result = await checkLabeledDeployment('phoenix', 'phoenix')

      expect(result).toBe(false)
    })

    it('returns false on network error', async () => {
      mockGet.mockRejectedValueOnce(new Error('Network failure'))

      const result = await checkLabeledDeployment('phoenix', 'phoenix')

      expect(result).toBe(false)
    })

    it('returns false on API error', async () => {
      mockGet.mockRejectedValueOnce({
        status: 500,
        message: 'Internal server error',
      })

      const result = await checkLabeledDeployment('phoenix', 'phoenix')

      expect(result).toBe(false)
    })

    it('returns true when at least one deployment is available among multiple', async () => {
      mockGet.mockResolvedValueOnce({
        apiVersion: 'apps/v1',
        kind: 'DeploymentList',
        items: [
          {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            metadata: {
              name: 'phoenix-deployment-1',
              namespace: 'phoenix',
            },
            status: {
              conditions: [
                {
                  type: 'Available',
                  status: 'False',
                },
              ],
            },
          },
          {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            metadata: {
              name: 'phoenix-deployment-2',
              namespace: 'phoenix',
            },
            status: {
              conditions: [
                {
                  type: 'Available',
                  status: 'True',
                },
              ],
            },
          },
        ],
      })

      const result = await checkLabeledDeployment('phoenix', 'phoenix')

      expect(result).toBe(true)
    })

    it('returns false when deployment has Progressing condition but not Available', async () => {
      mockGet.mockResolvedValueOnce({
        apiVersion: 'apps/v1',
        kind: 'DeploymentList',
        items: [
          {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            metadata: {
              name: 'phoenix-deployment',
              namespace: 'phoenix',
            },
            status: {
              conditions: [
                {
                  type: 'Progressing',
                  status: 'True',
                },
              ],
            },
          },
        ],
      })

      const result = await checkLabeledDeployment('phoenix', 'phoenix')

      expect(result).toBe(false)
    })

    it('uses URLSearchParams for label selector encoding', async () => {
      mockGet.mockResolvedValueOnce({
        apiVersion: 'apps/v1',
        kind: 'DeploymentList',
        items: [],
      })

      await checkLabeledDeployment('test-item', 'test-namespace')

      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining('namespace=test-namespace')
      )
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining('labelSelector=ark.mckinsey.com%2Fmarketplace-item%3Dtest-item')
      )
    })

    it('handles deployment with multiple conditions correctly', async () => {
      mockGet.mockResolvedValueOnce({
        apiVersion: 'apps/v1',
        kind: 'DeploymentList',
        items: [
          {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            metadata: {
              name: 'phoenix-deployment',
              namespace: 'phoenix',
            },
            status: {
              conditions: [
                {
                  type: 'Progressing',
                  status: 'True',
                },
                {
                  type: 'ReplicaFailure',
                  status: 'False',
                },
                {
                  type: 'Available',
                  status: 'True',
                },
              ],
            },
          },
        ],
      })

      const result = await checkLabeledDeployment('phoenix', 'phoenix')

      expect(result).toBe(true)
    })
  })
})
