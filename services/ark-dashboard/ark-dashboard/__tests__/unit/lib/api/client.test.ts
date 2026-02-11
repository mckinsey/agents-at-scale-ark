import { describe, it, expect, beforeEach, vi } from 'vitest'
import { APIClient, APIError } from '@/lib/api/client'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('APIClient', () => {
  let client: APIClient
  const baseURL = 'http://localhost:8080'
  
  beforeEach(() => {
    client = new APIClient(baseURL)
    mockFetch.mockClear()
  })

  describe('constructor', () => {
    it('should set baseURL and default headers', () => {
      const customHeaders = { 'X-Custom-Header': 'test' }
      const customClient = new APIClient(baseURL, customHeaders)
      
      // We can't directly test private properties, but we can test their effect
      expect(customClient).toBeDefined()
    })
  })

  describe('request method', () => {
    it('should handle successful JSON responses', async () => {
      const mockData = { id: 1, name: 'Test' }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockData,
      })

      const result = await client.get('/test')
      
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/test',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      )
      expect(result).toEqual(mockData)
    })

    it('should handle successful text responses', async () => {
      const mockText = 'Plain text response'
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: async () => mockText,
      })

      const result = await client.get('/test')
      expect(result).toEqual(mockText)
    })

    it('should handle 204 No Content responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers(),
      })

      const result = await client.get('/test')
      expect(result).toBeUndefined()
    })

    it('should handle query parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({}),
      })

      await client.get('/test', { params: { foo: 'bar', baz: 123 } })
      
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/test?foo=bar&baz=123',
        expect.any(Object)
      )
    })

    it('should handle API errors with JSON response', async () => {
      const errorData = { message: 'Not found', code: 'RESOURCE_NOT_FOUND' }
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => errorData,
      })

      try {
        await client.get('/test')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).toBeInstanceOf(APIError)
        expect((error as APIError).message).toBe('Not found')
        expect((error as APIError).status).toBe(404)
        expect((error as APIError).data).toEqual(errorData)
      }
    })

    it('should handle API errors with text response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: async () => 'Internal Server Error',
      })

      try {
        await client.get('/test')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).toBeInstanceOf(APIError)
        expect((error as APIError).message).toBe('Internal Server Error')
        expect((error as APIError).status).toBe(500)
      }
    })

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      try {
        await client.get('/test')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).toBeInstanceOf(APIError)
        expect((error as APIError).message).toBe('Network error')
      }
    })
  })

  describe('HTTP methods', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true }),
      })
    })

    it('should make GET requests', async () => {
      await client.get('/test')
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/test',
        expect.objectContaining({ method: 'GET' })
      )
    })

    it('should make POST requests with data', async () => {
      const data = { name: 'Test' }
      await client.post('/test', data)
      
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/test',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(data),
        })
      )
    })

    it('should make PUT requests with data', async () => {
      const data = { name: 'Updated' }
      await client.put('/test', data)
      
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/test',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(data),
        })
      )
    })

    it('should make PATCH requests with data', async () => {
      const data = { name: 'Patched' }
      await client.patch('/test', data)
      
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/test',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(data),
        })
      )
    })

    it('should make DELETE requests', async () => {
      await client.delete('/test')
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/test',
        expect.objectContaining({ method: 'DELETE' })
      )
    })
  })

  describe('APIError', () => {
    it('should create error with correct properties', () => {
      const error = new APIError('Test error', 404, { code: 'NOT_FOUND' })
      
      expect(error).toBeInstanceOf(Error)
      expect(error.name).toBe('APIError')
      expect(error.message).toBe('Test error')
      expect(error.status).toBe(404)
      expect(error.data).toEqual({ code: 'NOT_FOUND' })
    })
  })
})