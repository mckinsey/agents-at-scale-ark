import { describe, it, expect, beforeEach, vi } from 'vitest'
import { teamsService } from '@/lib/services/teams'
import { apiClient } from '@/lib/api/client'
import type { TeamDetailResponse, TeamListResponse } from '@/lib/services/teams'

// Mock the API client
vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('teamsService', () => {
  const mockTeam: TeamDetailResponse = {
    name: 'test-team',
    displayName: 'Test Team',
    description: 'A test team',
    members: [
      { type: 'agent', name: 'agent1' },
      { type: 'agent', name: 'agent2' },
    ],
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getAll', () => {
    it('should fetch all teams and add id field', async () => {
      const mockListResponse: TeamListResponse = {
        items: [
          { name: 'team1', displayName: 'Team 1' },
          { name: 'team2', displayName: 'Team 2' },
        ],
      }

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockListResponse)
      vi.mocked(apiClient.get).mockResolvedValueOnce({ ...mockTeam, name: 'team1' })
      vi.mocked(apiClient.get).mockResolvedValueOnce({ ...mockTeam, name: 'team2' })

      const result = await teamsService.getAll()

      expect(apiClient.get).toHaveBeenCalledWith(`/api/v1/teams`)
      expect(apiClient.get).toHaveBeenCalledWith(`/api/v1/teams/team1`)
      expect(apiClient.get).toHaveBeenCalledWith(`/api/v1/teams/team2`)
      
      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({ id: 'team1', name: 'team1' })
      expect(result[1]).toMatchObject({ id: 'team2', name: 'team2' })
    })
  })

  describe('getByName', () => {
    it('should fetch team by name and add id field', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockTeam)

      const result = await teamsService.getByName('test-team')

      expect(apiClient.get).toHaveBeenCalledWith(
        `/api/v1/teams/test-team`
      )
      expect(result).toMatchObject({
        ...mockTeam,
        id: 'test-team',
      })
    })

    it('should return null for 404 errors', async () => {
      const error = new Error('Not found') as any
      error.response = { status: 404 }
      vi.mocked(apiClient.get).mockRejectedValueOnce(error)

      const result = await teamsService.getByName('non-existent')

      expect(result).toBeNull()
    })

    it('should throw other errors', async () => {
      const error = new Error('Server error')
      vi.mocked(apiClient.get).mockRejectedValueOnce(error)

      await expect(teamsService.getByName('test-team')).rejects.toThrow(
        'Server error'
      )
    })
  })

  describe('getById', () => {
    it('should convert numeric ID to string and call getByName', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockTeam)

      const result = await teamsService.getById(123)

      expect(apiClient.get).toHaveBeenCalledWith(
        `/api/v1/teams/123`
      )
      expect(result).toMatchObject({ id: 'test-team' })
    })

    it('should handle string IDs', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockTeam)

      await teamsService.getById('string-id')

      expect(apiClient.get).toHaveBeenCalledWith(
        `/api/v1/teams/string-id`
      )
    })
  })

  describe('create', () => {
    it('should create team and add id field', async () => {
      const createRequest = {
        name: 'new-team',
        displayName: 'New Team',
        members: [{ type: 'agent' as const, name: 'agent1' }],
      }

      vi.mocked(apiClient.post).mockResolvedValueOnce({
        ...mockTeam,
        name: 'new-team',
      })

      const result = await teamsService.create(createRequest)

      expect(apiClient.post).toHaveBeenCalledWith(
        `/api/v1/teams`,
        createRequest
      )
      expect(result).toMatchObject({
        id: 'new-team',
        name: 'new-team',
      })
    })
  })

  describe('update', () => {
    it('should update team and return with id field', async () => {
      const updates = { displayName: 'Updated Team' }
      
      vi.mocked(apiClient.put).mockResolvedValueOnce({
        ...mockTeam,
        displayName: 'Updated Team',
      })

      const result = await teamsService.update('test-team', updates)

      expect(apiClient.put).toHaveBeenCalledWith(
        `/api/v1/teams/test-team`,
        updates
      )
      expect(result).toMatchObject({
        id: 'test-team',
        displayName: 'Updated Team',
      })
    })

    it('should return null for 404 errors', async () => {
      const error = new Error('Not found') as any
      error.response = { status: 404 }
      vi.mocked(apiClient.put).mockRejectedValueOnce(error)

      const result = await teamsService.update('non-existent', {})

      expect(result).toBeNull()
    })
  })

  describe('updateById', () => {
    it('should convert ID to string and call update', async () => {
      const updates = { displayName: 'Updated' }
      vi.mocked(apiClient.put).mockResolvedValueOnce(mockTeam)

      await teamsService.updateById(123, updates)

      expect(apiClient.put).toHaveBeenCalledWith(
        `/api/v1/teams/123`,
        updates
      )
    })
  })

  describe('delete', () => {
    it('should delete team and return true', async () => {
      vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined)

      const result = await teamsService.delete('test-team')

      expect(apiClient.delete).toHaveBeenCalledWith(
        `/api/v1/teams/test-team`
      )
      expect(result).toBe(true)
    })

    it('should return false for 404 errors', async () => {
      const error = new Error('Not found') as any
      error.response = { status: 404 }
      vi.mocked(apiClient.delete).mockRejectedValueOnce(error)

      const result = await teamsService.delete('non-existent')

      expect(result).toBe(false)
    })

    it('should throw other errors', async () => {
      const error = new Error('Server error')
      vi.mocked(apiClient.delete).mockRejectedValueOnce(error)

      await expect(teamsService.delete('test-team')).rejects.toThrow(
        'Server error'
      )
    })
  })

  describe('deleteById', () => {
    it('should convert ID to string and call delete', async () => {
      vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined)

      const result = await teamsService.deleteById(123)

      expect(apiClient.delete).toHaveBeenCalledWith(
        `/api/v1/teams/123`
      )
      expect(result).toBe(true)
    })
  })
})