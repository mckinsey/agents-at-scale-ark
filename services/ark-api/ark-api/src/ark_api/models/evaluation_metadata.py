"""Pydantic models for evaluation metadata extracted from annotations."""

from typing import List, Dict, Optional, Any
from pydantic import BaseModel, Field


class EventEvaluationMetadata(BaseModel):
    """Enhanced metadata for event-based evaluations."""
    total_rules: Optional[int] = None
    passed_rules: Optional[int] = None
    failed_rules: Optional[int] = None
    total_weight: Optional[float] = None
    weighted_score: Optional[float] = None
    min_score_threshold: Optional[float] = None
    events_analyzed: Optional[int] = None
    query_name: Optional[str] = None
    session_id: Optional[str] = None
    rule_results: Optional[List[Dict[str, Any]]] = Field(default_factory=list)


class BaselineEvaluationMetadata(BaseModel):
    """Enhanced metadata for baseline evaluations."""
    baseline_score: Optional[float] = None
    current_score: Optional[float] = None
    improvement: Optional[float] = None
    baseline_passed: Optional[bool] = None
    current_passed: Optional[bool] = None
    comparison_threshold: Optional[float] = None
    baseline_metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)


class QueryEvaluationMetadata(BaseModel):
    """Enhanced metadata for query-based evaluations."""
    query_name: Optional[str] = None
    query_namespace: Optional[str] = None
    response_target: Optional[str] = None
    execution_time: Optional[float] = None
    tokens_used: Optional[int] = None
    query_status: Optional[str] = None
    response_quality: Optional[float] = None


class BatchEvaluationMetadata(BaseModel):
    """Enhanced metadata for batch evaluations."""
    total_evaluations: Optional[int] = None
    completed_evaluations: Optional[int] = None
    failed_evaluations: Optional[int] = None
    pending_evaluations: Optional[int] = None
    average_score: Optional[float] = None
    min_score: Optional[float] = None
    max_score: Optional[float] = None
    batch_passed: Optional[bool] = None
    evaluation_results: Optional[List[Dict[str, Any]]] = Field(default_factory=list)


class DirectEvaluationMetadata(BaseModel):
    """Enhanced metadata for direct evaluations."""
    input_length: Optional[int] = None
    output_length: Optional[int] = None
    evaluation_duration: Optional[float] = None
    model_used: Optional[str] = None
    reasoning_quality: Optional[float] = None
    confidence_score: Optional[float] = None


class CategoryBreakdown(BaseModel):
    """Category-wise breakdown of evaluation results."""
    category: str
    score: Optional[float] = None
    passed: Optional[bool] = None
    weight: Optional[float] = None
    description: Optional[str] = None


class UnifiedEvaluationMetadata(BaseModel):
    """Unified metadata model that can contain any evaluation type metadata."""
    evaluation_type: Optional[str] = None
    event_metadata: Optional[EventEvaluationMetadata] = None
    baseline_metadata: Optional[BaselineEvaluationMetadata] = None
    query_metadata: Optional[QueryEvaluationMetadata] = None
    batch_metadata: Optional[BatchEvaluationMetadata] = None
    direct_metadata: Optional[DirectEvaluationMetadata] = None
    category_breakdown: Optional[List[CategoryBreakdown]] = Field(default_factory=list)
    custom_fields: Optional[Dict[str, Any]] = Field(default_factory=dict)