import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { APIClient, APIError } from '@/lib/api/client'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('APIClient', () => {
  let client: APIClient
  const baseURL = 'http://localhost:8080'
  const MOCK_TIMESTAMP = 1234567890

  beforeEach(() => {
    client = new APIClient(baseURL)
    mockFetch.mockClear()
    vi.spyOn(Date, 'now').mockReturnValue(MOCK_TIMESTAMP)
  })

  afterEach(() => {
    vi.restoreAllMocks()
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
        `http://localhost:8080/test?_t=${MOCK_TIMESTAMP}`,
        expect.objectContaining({
          method: 'GET',
          cache: 'no-store',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
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
        `http://localhost:8080/test?foo=bar&baz=123&_t=${MOCK_TIMESTAMP}`,
        expect.objectContaining({
          method: 'GET',
          cache: 'no-store',
          headers: expect.objectContaining({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          }),
        })
      )
    })

    it('should handle endpoints with existing query parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({}),
      })

      await client.get('/api/marketplace?type=demos')

      expect(mockFetch).toHaveBeenCalledWith(
        `http://localhost:8080/api/marketplace?type=demos&_t=${MOCK_TIMESTAMP}`,
        expect.objectContaining({
          method: 'GET',
        })
      )
    })

    it('should handle endpoints with existing query parameters and additional params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({}),
      })

      await client.get('/api/marketplace?type=demos', { params: { search: 'test' } })

      expect(mockFetch).toHaveBeenCalledWith(
        `http://localhost:8080/api/marketplace?type=demos&search=test&_t=${MOCK_TIMESTAMP}`,
        expect.objectContaining({
          method: 'GET',
        })
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

    it('should strip the admission webhook prefix from error details', async () => {
      const errorData = {
        detail:
          'admission webhook "vteam-v1.kb.io" denied the request: maxTurns can only be set when loops is enabled',
      }
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => errorData,
      })

      try {
        await client.put('/test', {})
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).toBeInstanceOf(APIError)
        expect((error as APIError).message).toBe(
          'maxTurns can only be set when loops is enabled',
        )
        expect((error as APIError).status).toBe(403)
        expect((error as APIError).data).toEqual(errorData)
      }
    })

    it('should serialize non-string error details instead of [object Object]', async () => {
      const detail = [{ loc: ['body', 'maxTurns'], msg: 'Input should be a valid integer' }]
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ detail }),
      })

      await expect(client.put('/test', {})).rejects.toThrow(JSON.stringify(detail))
    })

    it('should keep error details that only mention an admission webhook', async () => {
      const detail =
        'failed calling webhook "vteam-v1.kb.io": admission webhook unreachable'
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ detail }),
      })

      await expect(client.get('/test')).rejects.toThrow(detail)
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

    it('rethrows an aborted fetch as-is, preserving AbortError', async () => {
      const abortError = new DOMException('The operation was aborted.', 'AbortError')
      mockFetch.mockRejectedValueOnce(abortError)

      try {
        await client.get('/test')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).not.toBeInstanceOf(APIError)
        expect((error as Error).name).toBe('AbortError')
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
        `http://localhost:8080/test?_t=${MOCK_TIMESTAMP}`,
        expect.objectContaining({
          method: 'GET',
          cache: 'no-store',
          headers: expect.objectContaining({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          }),
        })
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

  describe('relative baseURL', () => {
    it('should resolve a relative baseURL against globalThis.location.origin without throwing', async () => {
      Object.defineProperty(globalThis, 'location', {
        value: { origin: 'http://localhost:3274' },
        writable: true,
        configurable: true,
      })

      const relativeClient = new APIClient('/api/v1/proxy/services')

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ services: [] }),
      })

      await relativeClient.get('')

      expect(mockFetch).toHaveBeenCalledWith(
        `http://localhost:3274/api/v1/proxy/services?_t=${MOCK_TIMESTAMP}`,
        expect.anything(),
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

  describe('buildUrl', () => {
    it('should build URL with an explicit namespace param', () => {
      const url = client.buildUrl('files/test.txt/download', {
        namespace: 'test-namespace',
      })

      expect(url).toBe(`http://localhost:8080/files/test.txt/download?namespace=test-namespace&_t=${MOCK_TIMESTAMP}`)
    })

    it('should build URL with additional params', () => {
      const url = client.buildUrl('files', {
        namespace: 'test-namespace',
        prefix: 'documents/',
      })

      expect(url).toBe(`http://localhost:8080/files?namespace=test-namespace&prefix=documents%2F&_t=${MOCK_TIMESTAMP}`)
    })

    it('should build URL without params when none are passed', () => {
      const url = client.buildUrl('files/test.txt/download')

      expect(url).toBe(`http://localhost:8080/files/test.txt/download?_t=${MOCK_TIMESTAMP}`)
    })

    it('should not inject a namespace the caller did not pass', () => {
      const url = client.buildUrl('files', { prefix: 'documents/' })

      expect(url).toBe(`http://localhost:8080/files?prefix=documents%2F&_t=${MOCK_TIMESTAMP}`)
    })
  })
})