import { trackEvent } from '@/lib/analytics/singleton';
import { apiClient } from '@/lib/api/client';
import type { components } from '@/lib/api/generated/types';

// Helper type for API errors
interface APIError extends Error {
  status?: number;
}

// Type definitions based on API schema
export type EvaluationResponse = components['schemas']['EvaluationResponse'];
export type EvaluationDetailResponse =
  components['schemas']['EvaluationDetailResponse'];
export type EvaluationListResponse =
  components['schemas']['EvaluationListResponse'];
export type EvaluationCreateRequest =
  components['schemas']['EvaluationCreateRequest'];
export type EvaluationUpdateRequest =
  components['schemas']['EvaluationUpdateRequest'];

export type Evaluation = EvaluationResponse;

// Enhanced evaluation metadata types
export interface EventEvaluationMetadata {
  total_rules?: number;
  passed_rules?: number;
  failed_rules?: number;
  total_weight?: number;
  weighted_score?: number;
  min_score_threshold?: number;
  events_analyzed?: number;
  query_name?: string;
  session_id?: string;
  rule_results?: Array<{
    rule_name: string;
    passed: boolean;
    score?: number;
    weight?: number;
    reasoning?: string;
    error?: string;
  }>;
}

export interface BaselineEvaluationMetadata {
  baseline_score?: number;
  current_score?: number;
  improvement?: number;
  baseline_passed?: boolean;
  current_passed?: boolean;
  comparison_threshold?: number;
  baseline_metadata?: Record<string, unknown>;
}

export interface QueryEvaluationMetadata {
  query_name?: string;
  query_namespace?: string;
  response_target?: string;
  execution_time?: number;
  tokens_used?: number;
  query_status?: string;
  response_quality?: number;
}

export interface BatchEvaluationMetadata {
  total_evaluations?: number;
  completed_evaluations?: number;
  failed_evaluations?: number;
  pending_evaluations?: number;
  average_score?: number;
  min_score?: number;
  max_score?: number;
  batch_passed?: boolean;
  evaluation_results?: Array<Record<string, unknown>>;
}

export interface DirectEvaluationMetadata {
  input_length?: number;
  output_length?: number;
  evaluation_duration?: number;
  model_used?: string;
  reasoning_quality?: number;
  confidence_score?: number;
}

export interface CategoryBreakdown {
  category: string;
  score?: number;
  passed?: boolean;
  weight?: number;
  description?: string;
}

export interface EnhancedEvaluationMetadata {
  evaluation_type?: string;
  event_metadata?: EventEvaluationMetadata;
  baseline_metadata?: BaselineEvaluationMetadata;
  query_metadata?: QueryEvaluationMetadata;
  batch_metadata?: BatchEvaluationMetadata;
  direct_metadata?: DirectEvaluationMetadata;
  category_breakdown?: CategoryBreakdown[];
  custom_fields?: Record<string, unknown>;
}

// Enhanced evaluation response types
export interface EnhancedEvaluationResponse extends EvaluationResponse {
  enhanced_metadata?: EnhancedEvaluationMetadata;
}

export interface EnhancedEvaluationDetailResponse
  extends EvaluationDetailResponse {
  enhanced_metadata?: EnhancedEvaluationMetadata;
}

export interface EnhancedEvaluationListResponse {
  items: EnhancedEvaluationResponse[];
  count: number;
}

// Filter types for advanced filtering
export interface EvaluationFilter {
  mode?: string[];
  queryRef?: string;
  namespace?: string;
  evaluatorRef?: string;
}

// Helper interface for spec access (for future use)
// interface EvaluationSpec {
//   queryRef?: { name: string }
//   evaluator?: { name: string }
// }

export interface QueryEvaluationSummary {
  total: number;
  passed: number;
  failed: number;
  pending: number;
  status: 'none' | 'all-passed' | 'all-failed' | 'mixed' | 'pending';
}

export const evaluationsService = {
  /**
   * Get all evaluations in a namespace with optional filtering
   */
  async getAll(): Promise<Evaluation[]> {
    const response =
      await apiClient.get<EvaluationListResponse>(`/api/v1/evaluations`);

    // For now, just use the response items directly
    // TODO: Implement proper filtering once we have real spec data
    return response.items || [];
  },

  /**
   * Get all evaluations with full details including spec
   */
  async getAllWithDetails(
    enhanced: boolean = false,
  ): Promise<
    (
      | Evaluation
      | EvaluationDetailResponse
      | EnhancedEvaluationResponse
      | EnhancedEvaluationDetailResponse
    )[]
  > {
    const url = enhanced
      ? `/api/v1/evaluations?enhanced=true`
      : `/api/v1/evaluations`;

    const response = enhanced
      ? await apiClient.get<EnhancedEvaluationListResponse>(url)
      : await apiClient.get<EvaluationListResponse>(url);

    // Debug: log evaluation count for troubleshooting
    if (process.env.NODE_ENV === 'development') {
      console.log(
        `Found ${response.items?.length || 0} evaluations:`,
        response.items?.map(e => `${e.name} (${e.type})`) || [],
      );
    }

    if (!response.items || response.items.length === 0) {
      return [];
    }

    // Fetch details for each evaluation in parallel
    const detailPromises = response.items.map(async evaluation => {
      try {
        const detailed = enhanced
          ? await this.getEnhancedDetailsByName(evaluation.name)
          : await this.getDetailsByName(evaluation.name);
        return { success: true, data: detailed, fallback: evaluation };
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(
            `Failed to get details for evaluation ${evaluation.name}:`,
            error,
          );
        }
        return { success: false, data: null, fallback: evaluation };
      }
    });

    const results = await Promise.allSettled(detailPromises);

    // Return detailed data where available, fallback to basic data otherwise
    return results
      .filter(
        (
          result,
        ): result is PromiseFulfilledResult<{
          success: boolean;
          data: EvaluationDetailResponse | null;
          fallback: Evaluation;
        }> => result.status === 'fulfilled',
      )
      .map(result => {
        const { success, data, fallback } = result.value;
        return success && data ? data : fallback;
      });
  },

  /**
   * Get a single evaluation by name
   */
  async getByName(name: string): Promise<Evaluation | null> {
    try {
      const response = await apiClient.get<EvaluationResponse>(
        `/api/v1/evaluations/${name}`,
      );
      return response;
    } catch (error) {
      if ((error as APIError).status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch evaluation: ${error}`);
    }
  },

  /**
   * Get detailed evaluation by name with full spec
   */
  async getDetailsByName(
    name: string,
  ): Promise<EvaluationDetailResponse | null> {
    try {
      const response = await apiClient.get<EvaluationDetailResponse>(
        `/api/v1/evaluations/${name}`,
      );
      return response;
    } catch (error) {
      if ((error as APIError).status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch evaluation details: ${error}`);
    }
  },

  /**
   * Get enhanced detailed evaluation by name with full spec and enhanced metadata
   */
  async getEnhancedDetailsByName(
    name: string,
  ): Promise<EnhancedEvaluationDetailResponse | null> {
    try {
      const response = await apiClient.get<EnhancedEvaluationDetailResponse>(
        `/api/v1/evaluations/${name}?enhanced=true`,
      );
      return response;
    } catch (error) {
      if ((error as APIError).status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch enhanced evaluation details: ${error}`);
    }
  },

  /**
   * Create a new evaluation
   */
  async create(evaluation: EvaluationCreateRequest): Promise<Evaluation> {
    const response = await apiClient.post<EvaluationResponse>(
      `/api/v1/evaluations`,
      evaluation,
    );
    trackEvent({
      name: 'evaluation_created',
      properties: {
        evaluationName: response.name,
        evaluatorRef: evaluation.evaluator,
      },
    });
    return response;
  },

  /**
   * Update an existing evaluation
   */
  async update(
    name: string,
    updates: EvaluationUpdateRequest,
  ): Promise<Evaluation | null> {
    try {
      const response = await apiClient.put<EvaluationResponse>(
        `/api/v1/evaluations/${name}`,
        updates,
      );
      trackEvent({
        name: 'evaluation_updated',
        properties: { evaluationName: response.name },
      });
      return response;
    } catch (error) {
      if ((error as APIError).status === 404) {
        return null;
      }
      throw new Error(`Failed to update evaluation: ${error}`);
    }
  },

  /**
   * Delete an evaluation
   */
  async delete(name: string): Promise<boolean> {
    try {
      await apiClient.delete(`/api/v1/evaluations/${name}`);
      trackEvent({
        name: 'evaluation_deleted',
        properties: { evaluationName: name },
      });
      return true;
    } catch (error) {
      if ((error as APIError).status === 404) {
        return false;
      }
      throw new Error(`Failed to delete evaluation: ${error}`);
    }
  },

  /**
   * Cancel a running evaluation
   */
  async cancel(name: string): Promise<Evaluation | null> {
    try {
      const response = await apiClient.patch<EvaluationResponse>(
        `/api/v1/evaluations/${name}/cancel`,
      );
      return response;
    } catch (error) {
      if ((error as APIError).status === 404) {
        return null;
      }
      throw new Error(`Failed to cancel evaluation: ${error}`);
    }
  },

  /**
   * Get evaluations by query reference
   */
  async getByQueryRef(
    queryName: string,
    enhanced: boolean = false,
  ): Promise<Evaluation[] | EnhancedEvaluationResponse[]> {
    // Use the backend filter to efficiently get evaluations for a specific query
    const url = enhanced
      ? `/api/v1/evaluations?enhanced=true&query_ref=${encodeURIComponent(queryName)}`
      : `/api/v1/evaluations?query_ref=${encodeURIComponent(queryName)}`;

    const response = enhanced
      ? await apiClient.get<EnhancedEvaluationListResponse>(url)
      : await apiClient.get<EvaluationListResponse>(url);

    return response.items || [];
  },

  /**
   * Get evaluation summary for a query
   */
  async getEvaluationSummary(
    queryName: string,
    enhanced: boolean = false,
  ): Promise<QueryEvaluationSummary> {
    const evaluations = await this.getByQueryRef(queryName, enhanced);

    if (evaluations.length === 0) {
      return {
        total: 0,
        passed: 0,
        failed: 0,
        pending: 0,
        status: 'none',
      };
    }

    let passed = 0;
    let failed = 0;
    let pending = 0;

    evaluations.forEach(evaluation => {
      const phase = evaluation.phase;
      const evaluationPassed = evaluation.passed;

      if (phase === 'done') {
        if (evaluationPassed === true) {
          passed++;
        } else if (evaluationPassed === false) {
          failed++;
        } else {
          // Done but no pass/fail status
          pending++;
        }
      } else {
        // Not done yet (running, error, etc.)
        pending++;
      }
    });

    const total = evaluations.length;
    let status: QueryEvaluationSummary['status'];

    if (pending > 0) {
      status = 'pending';
    } else if (passed === total) {
      status = 'all-passed';
    } else if (failed === total) {
      status = 'all-failed';
    } else {
      status = 'mixed';
    }

    return {
      total,
      passed,
      failed,
      pending,
      status,
    };
  },
};
