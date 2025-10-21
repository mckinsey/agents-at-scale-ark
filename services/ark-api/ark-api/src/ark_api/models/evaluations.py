"""Pydantic models for Evaluation resources."""

from typing import List, Dict, Optional, Any
from pydantic import BaseModel
from enum import Enum
import json
from .evaluation_metadata import UnifiedEvaluationMetadata


class EvaluationType(str, Enum):
    """Evaluation types."""
    DIRECT = "direct"
    BASELINE = "baseline"
    QUERY = "query"
    BATCH = "batch"
    EVENT = "event"


class EvaluatorReference(BaseModel):
    """Reference to an evaluator."""
    name: str
    namespace: Optional[str] = None
    parameters: Optional[List[Dict[str, Any]]] = None


class QueryRef(BaseModel):
    """Reference to a query for evaluation."""
    name: str
    namespace: Optional[str] = None
    responseTarget: Optional[str] = None


class EvaluationRef(BaseModel):
    """Reference to an evaluation for batch aggregation."""
    name: str
    namespace: Optional[str] = None


class DirectEvaluationConfig(BaseModel):
    """Configuration for direct evaluation."""
    input: str
    output: str


class QueryBasedEvaluationConfig(BaseModel):
    """Configuration for query-based evaluation."""
    queryRef: Optional[QueryRef] = None


class BatchEvaluationConfig(BaseModel):
    """Configuration for batch evaluation."""
    evaluations: Optional[List[EvaluationRef]] = []


class BaselineEvaluationConfig(BaseModel):
    """Configuration for baseline evaluation."""
    pass


class EventEvaluationConfig(BaseModel):
    """Configuration for event-based evaluation."""
    rules: Optional[List[Dict[str, Any]]] = []


class EvaluationConfig(BaseModel):
    """Unified evaluation configuration supporting all types."""
    # Direct evaluation fields
    input: Optional[str] = None
    output: Optional[str] = None
    
    # Query-based evaluation fields
    queryRef: Optional[QueryRef] = None
    
    # Batch evaluation fields
    evaluations: Optional[List[EvaluationRef]] = None
    
    # Event evaluation fields
    rules: Optional[List[Dict[str, Any]]] = None


class TokenUsage(BaseModel):
    """Token usage metrics."""
    promptTokens: Optional[int] = None
    completionTokens: Optional[int] = None
    totalTokens: Optional[int] = None


class BatchResult(BaseModel):
    """Result from batch evaluation."""
    evaluatorName: str
    score: Optional[float] = None
    passed: Optional[bool] = None
    message: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class ChildEvaluationStatus(BaseModel):
    """Status of child evaluations in batch mode."""
    total: int
    completed: int
    failed: int
    pending: int


class EvaluationResponse(BaseModel):
    """Basic evaluation response for list operations."""
    name: str
    namespace: str
    type: str
    phase: Optional[str] = None
    conditions: Optional[List[Dict[str, Any]]] = None
    score: Optional[str] = None
    passed: Optional[bool] = None
    message: Optional[str] = None


class EnhancedEvaluationResponse(BaseModel):
    """Enhanced evaluation response with metadata for list operations."""
    name: str
    namespace: str
    type: str
    phase: Optional[str] = None
    conditions: Optional[List[Dict[str, Any]]] = None
    score: Optional[str] = None
    passed: Optional[bool] = None
    message: Optional[str] = None
    enhanced_metadata: Optional[UnifiedEvaluationMetadata] = None


class EvaluationListResponse(BaseModel):
    """Response for listing evaluations."""
    items: List[EvaluationResponse]
    count: int


class EnhancedEvaluationListResponse(BaseModel):
    """Enhanced response for listing evaluations with metadata."""
    items: List[EnhancedEvaluationResponse]
    count: int


class EvaluationCreateRequest(BaseModel):
    """Request body for creating an evaluation."""
    name: str
    type: Optional[EvaluationType] = EvaluationType.DIRECT
    config: EvaluationConfig
    evaluator: EvaluatorReference
    ttl: Optional[str] = "720h"
    timeout: Optional[str] = "5m"


class EvaluationUpdateRequest(BaseModel):
    """Request body for updating an evaluation."""
    type: Optional[EvaluationType] = None
    config: Optional[EvaluationConfig] = None
    evaluator: Optional[EvaluatorReference] = None
    ttl: Optional[str] = None
    timeout: Optional[str] = None


class EvaluationDetailResponse(BaseModel):
    """Detailed evaluation response model."""
    name: str
    namespace: str
    spec: dict
    status: Optional[dict] = None
    metadata: dict
    tokenUsage: Optional[TokenUsage] = None
    batchResults: Optional[List[BatchResult]] = None
    childEvaluationStatus: Optional[ChildEvaluationStatus] = None


class EnhancedEvaluationDetailResponse(BaseModel):
    """Enhanced detailed evaluation response with metadata."""
    name: str
    namespace: str
    spec: dict
    status: Optional[dict] = None
    metadata: dict
    tokenUsage: Optional[TokenUsage] = None
    batchResults: Optional[List[BatchResult]] = None
    childEvaluationStatus: Optional[ChildEvaluationStatus] = None
    enhanced_metadata: Optional[UnifiedEvaluationMetadata] = None


def extract_unified_metadata_from_annotations(evaluation: dict) -> Optional[UnifiedEvaluationMetadata]:
    """Extract unified metadata from evaluation annotations."""
    metadata = evaluation.get("metadata", {})
    annotations = metadata.get("annotations", {})
    
    if not annotations:
        return None
    
    # Extract metadata from annotations with evaluation.metadata/ prefix
    extracted_metadata = {}
    for key, value in annotations.items():
        if key.startswith("evaluation.metadata/"):
            metadata_key = key.replace("evaluation.metadata/", "")
            # Try to parse JSON strings
            if isinstance(value, str) and (value.startswith("[") or value.startswith("{")):
                try:
                    extracted_metadata[metadata_key] = json.loads(value)
                except json.JSONDecodeError:
                    extracted_metadata[metadata_key] = value
            else:
                extracted_metadata[metadata_key] = value
    
    if not extracted_metadata:
        return None
    
    # Try to create UnifiedEvaluationMetadata from extracted data
    try:
        return UnifiedEvaluationMetadata(**extracted_metadata)
    except Exception:
        # If it fails, return None - the metadata might not match the expected structure
        return None


def evaluation_to_response(evaluation: dict) -> EvaluationResponse:
    """Convert a Kubernetes evaluation object to response model."""
    spec = evaluation.get("spec", {})
    status = evaluation.get("status", {})
    
    return EvaluationResponse(
        name=evaluation["metadata"]["name"],
        namespace=evaluation["metadata"]["namespace"],
        type=spec.get("type", "direct"),
        phase=status.get("phase"),
        conditions=status.get("conditions"),
        score=status.get("score"),
        passed=status.get("passed"),
        message=status.get("message")
    )


def evaluation_to_detail_response(evaluation: dict) -> EvaluationDetailResponse:
    """Convert a Kubernetes evaluation object to detailed response model."""
    status = evaluation.get("status", {})
    
    # Extract token usage if present
    token_usage = None
    if "tokenUsage" in status:
        token_usage = TokenUsage(**status["tokenUsage"])
    
    # Extract batch results if present
    batch_results = None
    if "batchResults" in status:
        batch_results = [BatchResult(**result) for result in status["batchResults"]]
    
    # Extract child evaluation status if present
    child_status = None
    if "childEvaluationStatus" in status:
        child_status = ChildEvaluationStatus(**status["childEvaluationStatus"])
    
    return EvaluationDetailResponse(
        name=evaluation["metadata"]["name"],
        namespace=evaluation["metadata"]["namespace"],
        spec=evaluation.get("spec", {}),
        status=status,
        metadata=evaluation.get("metadata", {}),
        tokenUsage=token_usage,
        batchResults=batch_results,
        childEvaluationStatus=child_status
    )


def enhanced_evaluation_to_response(evaluation: dict) -> EnhancedEvaluationResponse:
    """Convert a Kubernetes evaluation object to enhanced response model."""
    spec = evaluation.get("spec", {})
    status = evaluation.get("status", {})
    
    # Extract enhanced metadata from annotations
    enhanced_metadata = extract_unified_metadata_from_annotations(evaluation)
    
    return EnhancedEvaluationResponse(
        name=evaluation["metadata"]["name"],
        namespace=evaluation["metadata"]["namespace"],
        type=spec.get("type", "direct"),
        phase=status.get("phase"),
        conditions=status.get("conditions"),
        score=status.get("score"),
        passed=status.get("passed"),
        message=status.get("message"),
        enhanced_metadata=enhanced_metadata
    )


def enhanced_evaluation_to_detail_response(evaluation: dict) -> EnhancedEvaluationDetailResponse:
    """Convert a Kubernetes evaluation object to enhanced detailed response model."""
    status = evaluation.get("status", {})
    
    # Extract token usage if present
    token_usage = None
    if "tokenUsage" in status:
        token_usage = TokenUsage(**status["tokenUsage"])
    
    # Extract batch results if present
    batch_results = None
    if "batchResults" in status:
        batch_results = [BatchResult(**result) for result in status["batchResults"]]
    
    # Extract child evaluation status if present
    child_status = None
    if "childEvaluationStatus" in status:
        child_status = ChildEvaluationStatus(**status["childEvaluationStatus"])
    
    # Extract enhanced metadata from annotations
    enhanced_metadata = extract_unified_metadata_from_annotations(evaluation)
    
    return EnhancedEvaluationDetailResponse(
        name=evaluation["metadata"]["name"],
        namespace=evaluation["metadata"]["namespace"],
        spec=evaluation.get("spec", {}),
        status=status,
        metadata=evaluation.get("metadata", {}),
        tokenUsage=token_usage,
        batchResults=batch_results,
        childEvaluationStatus=child_status,
        enhanced_metadata=enhanced_metadata
    )