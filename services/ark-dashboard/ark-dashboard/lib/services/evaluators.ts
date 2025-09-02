import { apiClient } from "@/lib/api/client"
import type { components } from "@/lib/api/generated/types"

// Helper type for API errors
interface APIError extends Error {
  status?: number
}

// Type definitions based on API schema
export type EvaluatorResponse = components["schemas"]["EvaluatorResponse"]
export type EvaluatorDetailResponse = components["schemas"]["EvaluatorDetailResponse"]
export type EvaluatorListResponse = components["schemas"]["EvaluatorListResponse"]
export type EvaluatorCreateRequest = components["schemas"]["EvaluatorCreateRequest"]
export type EvaluatorUpdateRequest = components["schemas"]["EvaluatorUpdateRequest"]

export type Evaluator = EvaluatorResponse

export const evaluatorsService = {
  /**
   * Get all evaluators in a namespace
   */
  async getAll(namespace: string): Promise<Evaluator[]> {
    const response = await apiClient.get<EvaluatorListResponse>(
      `/api/v1/namespaces/${namespace}/evaluators`
    )
    
    return response.items || []
  },

  /**
   * Get a single evaluator by name (basic response)
   */
  async getByName(namespace: string, name: string): Promise<Evaluator | null> {
    try {
      const response = await apiClient.get<EvaluatorResponse>(
        `/api/v1/namespaces/${namespace}/evaluators/${name}`
      )
      return response
    } catch (error) {
      if ((error as APIError).status === 404) {
        return null
      }
      throw new Error(`Failed to fetch evaluator: ${error}`)
    }
  },

  /**
   * Get detailed evaluator information by name (includes spec)
   */
  async getDetailsByName(namespace: string, name: string): Promise<EvaluatorDetailResponse | null> {
    try {
      const response = await apiClient.get<EvaluatorDetailResponse>(
        `/api/v1/namespaces/${namespace}/evaluators/${name}`
      )
      return response
    } catch (error) {
      if ((error as APIError).status === 404) {
        return null
      }
      throw new Error(`Failed to fetch evaluator details: ${error}`)
    }
  },

  /**
   * Create a new evaluator
   */
  async create(namespace: string, evaluator: EvaluatorCreateRequest): Promise<Evaluator> {
    const response = await apiClient.post<EvaluatorResponse>(
      `/api/v1/namespaces/${namespace}/evaluators`,
      evaluator
    )
    
    return response as Evaluator
  },

  /**
   * Update an existing evaluator
   */
  async update(namespace: string, name: string, updates: EvaluatorUpdateRequest): Promise<Evaluator | null> {
    try {
      const response = await apiClient.put<EvaluatorResponse>(
        `/api/v1/namespaces/${namespace}/evaluators/${name}`,
        updates
      )
      return response
    } catch (error) {
      if ((error as APIError).status === 404) {
        return null
      }
      throw new Error(`Failed to update evaluator: ${error}`)
    }
  },

  /**
   * Delete an evaluator
   */
  async delete(namespace: string, name: string): Promise<boolean> {
    try {
      await apiClient.delete(
        `/api/v1/namespaces/${namespace}/evaluators/${name}`
      )
      return true
    } catch (error) {
      if ((error as APIError).status === 404) {
        return false
      }
      throw new Error(`Failed to delete evaluator: ${error}`)
    }
  }
}