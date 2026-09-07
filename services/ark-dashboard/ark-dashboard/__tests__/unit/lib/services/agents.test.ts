import { describe, it, expect, beforeEach, vi } from 'vitest'
import { agentsService } from '@/lib/services/agents'
import { apiClient, APIError } from '@/lib/api/client'
import type { AgentDetailResponse, AgentListResponse } from '@/lib/services/agents'

// Mock the API client, keeping the real APIError so instanceof checks work
vi.mock('@/lib/api/client', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>()
  return {
    ...actual,
    apiClient: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
  }
})

describe('agentsService', () => {
  const mockAgent: AgentDetailResponse = {
    name: 'test-agent',
    displayName: 'Test Agent',
    description: 'A test agent',
    model: { name: 'gpt-4', displayName: 'GPT-4' },
    tools: [],
    systemPrompt: 'You are a helpful assistant',
    parameters: {},
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getAll', () => {
    it('should fetch all agents and add id field', async () => {
      const mockListResponse: AgentListResponse = {
        items: [
          { name: 'agent1', displayName: 'Agent 1' },
          { name: 'agent2', displayName: 'Agent 2' },
        ],
      }

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockListResponse)
      vi.mocked(apiClient.get).mockResolvedValueOnce({ ...mockAgent, name: 'agent1' })
      vi.mocked(apiClient.get).mockResolvedValueOnce({ ...mockAgent, name: 'agent2' })

      const result = await agentsService.getAll('default')

      expect(apiClient.get).toHaveBeenCalledWith(`/api/v1/agents`, { params: { limit: 100, namespace: 'default' } })
      expect(apiClient.get).toHaveBeenCalledWith(`/api/v1/agents/agent1`, { params: { namespace: 'default' } })
      expect(apiClient.get).toHaveBeenCalledWith(`/api/v1/agents/agent2`, { params: { namespace: 'default' } })
      
      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({ id: 'agent1', name: 'agent1' })
      expect(result[1]).toMatchObject({ id: 'agent2', name: 'agent2' })
    })
  })

  describe('list', () => {
    it('should fetch all agents without hydrating each item', async () => {
      const mockListResponse: AgentListResponse = {
        items: [
          { name: 'agent1', displayName: 'Agent 1' },
          { name: 'agent2', displayName: 'Agent 2' },
        ],
      }

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockListResponse)

      const result = await agentsService.list('default')

      expect(apiClient.get).toHaveBeenCalledTimes(1)
      expect(apiClient.get).toHaveBeenCalledWith(`/api/v1/agents`, { params: { limit: 100, namespace: 'default' } })

      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({ id: 'agent1', name: 'agent1' })
      expect(result[1]).toMatchObject({ id: 'agent2', name: 'agent2' })
    })
  })

  describe('getByName', () => {
    it('should fetch agent by name and add id field', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockAgent)

      const result = await agentsService.getByName('default', 'test-agent')

      expect(apiClient.get).toHaveBeenCalledWith(
        `/api/v1/agents/test-agent`, { params: { namespace: 'default' } })
      expect(result).toMatchObject({
        ...mockAgent,
        id: 'test-agent',
      })
    })

    it('should return null for 404 errors', async () => {
      const error = new APIError('Not found', 404)
      vi.mocked(apiClient.get).mockRejectedValueOnce(error)

      const result = await agentsService.getByName('default', 'non-existent')

      expect(result).toBeNull()
    })

    it('should throw other errors', async () => {
      const error = new Error('Server error')
      vi.mocked(apiClient.get).mockRejectedValueOnce(error)

      await expect(agentsService.getByName('default', 'test-agent')).rejects.toThrow(
        'Server error'
      )
    })
  })

  describe('getById', () => {
    it('should convert numeric ID to string and call getByName', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockAgent)

      const result = await agentsService.getById('default', 123)

      expect(apiClient.get).toHaveBeenCalledWith(
        `/api/v1/agents/123`, { params: { namespace: 'default' } })
      expect(result).toMatchObject({ id: 'test-agent' })
    })

    it('should handle string IDs', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockAgent)

      await agentsService.getById('default', 'string-id')

      expect(apiClient.get).toHaveBeenCalledWith(
        `/api/v1/agents/string-id`, { params: { namespace: 'default' } })
    })
  })

  describe('create', () => {
    it('should create agent and add id field', async () => {
      const createRequest = {
        name: 'new-agent',
        displayName: 'New Agent',
        model: { name: 'gpt-4' },
      }

      vi.mocked(apiClient.post).mockResolvedValueOnce({
        ...mockAgent,
        name: 'new-agent',
      })

      const result = await agentsService.create('default', createRequest)

      expect(apiClient.post).toHaveBeenCalledWith(
        `/api/v1/agents`,
        createRequest, { params: { namespace: 'default' } })
      expect(result).toMatchObject({
        id: 'new-agent',
        name: 'new-agent',
      })
    })
  })

  describe('update', () => {
    it('should update agent and return with id field', async () => {
      const updates = { displayName: 'Updated Agent' }
      
      vi.mocked(apiClient.put).mockResolvedValueOnce({
        ...mockAgent,
        displayName: 'Updated Agent',
      })

      const result = await agentsService.update('default', 'test-agent', updates)

      expect(apiClient.put).toHaveBeenCalledWith(
        `/api/v1/agents/test-agent`,
        updates, { params: { namespace: 'default' } })
      expect(result).toMatchObject({
        id: 'test-agent',
        displayName: 'Updated Agent',
      })
    })

    it('should return null for 404 errors', async () => {
      const error = new APIError('Not found', 404)
      vi.mocked(apiClient.put).mockRejectedValueOnce(error)

      const result = await agentsService.update('default', 'non-existent', {})

      expect(result).toBeNull()
    })
  })

  describe('updateById', () => {
    it('should convert ID to string and call update', async () => {
      const updates = { displayName: 'Updated' }
      vi.mocked(apiClient.put).mockResolvedValueOnce(mockAgent)

      await agentsService.updateById('default', 123, updates)

      expect(apiClient.put).toHaveBeenCalledWith(
        `/api/v1/agents/123`,
        updates, { params: { namespace: 'default' } })
    })
  })

  describe('delete', () => {
    it('should delete agent and return true', async () => {
      vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined)

      const result = await agentsService.delete('default', 'test-agent')

      expect(apiClient.delete).toHaveBeenCalledWith(
        `/api/v1/agents/test-agent`, { params: { namespace: 'default' } })
      expect(result).toBe(true)
    })

    it('should return false for 404 errors', async () => {
      const error = new APIError('Not found', 404)
      vi.mocked(apiClient.delete).mockRejectedValueOnce(error)

      const result = await agentsService.delete('default', 'non-existent')

      expect(result).toBe(false)
    })

    it('should throw other errors', async () => {
      const error = new Error('Server error')
      vi.mocked(apiClient.delete).mockRejectedValueOnce(error)

      await expect(agentsService.delete('default', 'test-agent')).rejects.toThrow(
        'Server error'
      )
    })
  })

  describe('deleteById', () => {
    it('should convert ID to string and call delete', async () => {
      vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined)

      const result = await agentsService.deleteById('default', 123)

      expect(apiClient.delete).toHaveBeenCalledWith(
        `/api/v1/agents/123`, { params: { namespace: 'default' } })
      expect(result).toBe(true)
    })
  })
})