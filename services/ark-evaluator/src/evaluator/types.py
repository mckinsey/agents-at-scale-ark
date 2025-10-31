from typing import Dict, List, Any, Optional, Union, Literal
from pydantic import BaseModel, Field, field_validator
from enum import Enum
import logging

logger = logging.getLogger(__name__)

class QueryTarget(BaseModel):
    type: str
    name: str

class Response(BaseModel):
    target: QueryTarget
    content: str

class Model(BaseModel):
    name: str
    type: str
    config: Dict[str, Any] = {}

class ModelRef(BaseModel):
    """Reference to a Model CRD instead of inline model"""
    name: str
    namespace: Optional[str] = None

class EvaluationRequest(BaseModel):
    queryId: str
    input: Union[str, List[Dict[str, Any]]]
    responses: List[Response]
    query: Dict[str, Any]
    modelRef: Optional[ModelRef] = None

    @field_validator('input')
    def normalize_input(cls, v):
        if isinstance(v, str):
            return v

        if isinstance(v, list):
            messages = []
            for msg in v:
                if isinstance(msg, dict) and 'content' in msg:
                    role = msg.get('role', 'unknown')
                    content = msg.get('content', '')
                    messages.append(f"{role}: {content}")

            if not messages:
                raise ValueError("Chat message list is empty or malformed")

            return "\n".join(messages)

        raise ValueError(f"Input must be string or list of messages, got {type(v)}")

class EvaluationType(str, Enum):
    DIRECT = "direct"
    BASELINE = "baseline"
    QUERY = "query"
    BATCH = "batch"
    EVENT = "event"

class EvaluationScope(str, Enum):
    RELEVANCE = "relevance"
    ACCURACY = "accuracy"
    CONCISENESS = "conciseness"
    COMPLETENESS = "completeness"
    CLARITY = "clarity"
    USEFULNESS = "usefulness"
    COMPLIANCE = "compliance"
    APPROPRIATENESS = "appropriateness"
    REFUSAL_HANDLING = "refusal_handling"
    ALL = "all"
    # RAGAS context metrics
    CONTEXT_PRECISION = "context_precision"
    CONTEXT_RECALL = "context_recall"
    CONTEXT_ENTITY_RECALL = "context_entity_recall"
    FAITHFULNESS = "faithfulness"

class EvaluationParameters(BaseModel):
    scope: Optional[str] = Field(default="all", description="Evaluation scope")
    min_score: float = Field(default=0.7, ge=0.0, le=1.0, description="Minimum score threshold")
    
    # Extensible parameters
    max_tokens: Optional[int] = Field(default=None, gt=0, description="Maximum tokens for evaluation")
    temperature: Optional[float] = Field(default=0.0, ge=0.0, le=2.0, description="LLM temperature")
    evaluation_criteria: Optional[List[str]] = Field(default=None, description="Specific criteria to evaluate")
    context: Optional[str] = Field(default=None, description="Context for evaluation (e.g., retrieved documents, conversation history)")
    context_source: Optional[str] = Field(default=None, description="Source of the context (e.g., 'retrieval', 'conversation', 'agent_memory')")
    custom_metadata: Optional[Dict[str, Any]] = Field(default=None, description="Custom metadata")
    evaluator_role: Optional[str] = Field(default=None, description="Custom evaluator role description")
    
    @field_validator('scope')
    def validate_scope(cls, v):
        if v is None or not v:
            logger.warning("Empty scope provided, defaulting to 'all'")
            return "all"
        
        scope_str = str(v).lower().strip()
        
        if ',' in scope_str or ' ' in scope_str:
            scope_parts = [part.strip() for part in scope_str.replace(',', ' ').split()]
            valid_scopes = []
            
            for part in scope_parts:
                try:
                    # Validate against enum
                    EvaluationScope(part)
                    valid_scopes.append(part)
                except ValueError:
                    logger.warning(f"Unknown scope value '{part}' ignored")
            
            if not valid_scopes:
                logger.warning("No valid scope values found, defaulting to 'all'")
                return "all"
            
            return ",".join(valid_scopes)
        else:
            try:
                EvaluationScope(scope_str)
                return scope_str
            except ValueError:
                logger.warning(f"Unknown scope value '{v}', defaulting to 'all'")
                return "all"
                
    @classmethod
    def from_request_params(cls, params: Dict[str, Any]) -> "EvaluationParameters":
        """
        Create EvaluationParameters from request with validation and defaults
        """
        if not params:
            logger.warning("No parameters provided, using defaults")
            return cls()
        
        # Normalize parameter names (handle different naming conventions)
        param_mapping = {
            "scope": "scope",
            "min-score": "min_score",
            "min_score": "min_score",
            "threshold": "min_score",
            "max-tokens": "max_tokens",
            "max_tokens": "max_tokens",
            "temperature": "temperature",
            "evaluation-criteria": "evaluation_criteria",
            "evaluation_criteria": "evaluation_criteria",
            "evaluation.context": "context",
            "evaluation-context": "context",
            "evaluation_context": "context",
            "context": "context",
            "evaluation.context_source": "context_source",
            "evaluation-context-source": "context_source",
            "evaluation_context_source": "context_source",
            "context_source": "context_source",
            "evaluator-role": "evaluator_role",
            "evaluator_role": "evaluator_role",
            "custom-metadata": "custom_metadata",
            "custom_metadata": "custom_metadata"
        }
        
        normalized_params = {}
        for key, value in params.items():
            if key in param_mapping:
                normalized_params[param_mapping[key]] = value
                logger.info(f"Mapped parameter: {key} -> {param_mapping[key]}")
            else:
                # Unknown parameters go to custom_metadata
                if "custom_metadata" not in normalized_params:
                    normalized_params["custom_metadata"] = {}
                normalized_params["custom_metadata"][key] = value
                logger.warning(f"Unknown parameter moved to custom_metadata: {key} = {value}")
        
        logger.info(f"Normalized parameters: {list(normalized_params.keys())}")
        if "evaluator_role" in normalized_params:
            logger.info(f"evaluator_role successfully mapped: {normalized_params['evaluator_role'][:50]}...")
        
        # Handle evaluation_criteria conversion from string to list
        if "evaluation_criteria" in normalized_params and isinstance(normalized_params["evaluation_criteria"], str):
            criteria_string = normalized_params["evaluation_criteria"]
            normalized_params["evaluation_criteria"] = [c.strip() for c in criteria_string.split(",")]
            logger.info(f"Converted evaluation_criteria from string to list: {normalized_params['evaluation_criteria']}")
        
        try:
            result = cls(**normalized_params)
            logger.info(f"Successfully created EvaluationParameters with evaluator_role: {result.evaluator_role[:50] if result.evaluator_role else 'None'}...")
            return result
        except Exception as e:
            logger.error(f"Invalid parameters provided: {e}. Using defaults.")
            logger.error(f"Normalized params that failed: {normalized_params}")
            return cls()
    
    def get_scope_list(self) -> List[str]:
        """Get scope as a list of individual scope values"""
        if not self.scope or self.scope == "all":
            # Return only the base evaluation scopes (exclude "all" and RAGAS-specific metrics)
            base_scopes = [
                "relevance", "accuracy", "conciseness", "completeness",
                "clarity", "usefulness", "appropriateness", "compliance",
                "refusal_handling"
            ]
            return base_scopes
        return [scope.strip() for scope in self.scope.split(",")]
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for downstream use"""
        return self.model_dump(exclude_none=True)

class GoldenExample(BaseModel):
    input: str
    expectedOutput: str
    metadata: Optional[Dict[str, str]] = {}
    expectedMinScore: Optional[str] = None
    difficulty: Optional[str] = None
    category: Optional[str] = None

class TokenUsage(BaseModel):
    promptTokens: int = Field(default=0, description="Number of tokens in the prompt")
    completionTokens: int = Field(default=0, description="Number of tokens in the completion")
    totalTokens: int = Field(default=0, description="Total number of tokens")

class DatasetEvaluationResponse(BaseModel):
    evaluationId: str
    totalTestCases: int
    passedTestCases: int
    failedTestCases: int
    averageScore: str
    testCaseResults: Dict[str, Dict[str, Any]]  # testCaseName -> {score, passed, reasoning}
    error: Optional[str] = None
    
class EvaluationResponse(BaseModel):
    score: Optional[str] = None
    passed: bool = False
    metadata: Optional[Dict[str, str]] = None
    error: Optional[str] = None
    tokenUsage: Optional[TokenUsage] = Field(default_factory=lambda: TokenUsage())

class MetricEvaluationResponse(BaseModel):
    """Response from metric evaluation"""
    score: str  # Overall score (0.0-1.0) 
    passed: bool  # Whether metrics meet thresholds
    metrics: Dict[str, Any] = Field(default_factory=dict)  # Detailed metrics
    metadata: Optional[Dict[str, Any]] = None  # Additional evaluation metadata
    error: Optional[str] = None

# ============================================================================
# CRD-BASED REQUEST STRUCTURES
# ============================================================================

class QueryRef(BaseModel):
    """Reference to a query for evaluation"""
    name: str
    namespace: Optional[str] = None
    responseTarget: Optional[str] = None

class EvaluationRef(BaseModel):
    """Reference to an evaluation for batch aggregation"""
    name: str
    namespace: Optional[str] = None

class DirectEvaluationConfig(BaseModel):
    """Configuration for direct evaluation"""
    input: str
    output: str

class QueryBasedEvaluationConfig(BaseModel):
    """Configuration for query-based evaluation"""
    queryRef: Optional[QueryRef] = None

class BatchEvaluationConfig(BaseModel):
    """Configuration for batch evaluation"""
    evaluations: Optional[List[EvaluationRef]] = []

class BaselineEvaluationConfig(BaseModel):
    """Configuration for baseline evaluation"""
    pass

class EventEvaluationConfig(BaseModel):
    """Configuration for event-based evaluation"""
    rules: Optional[List[Dict[str, Any]]] = []

class EvaluationConfig(BaseModel):
    """Unified evaluation configuration supporting all types"""
    # Direct evaluation fields
    input: Optional[str] = None
    output: Optional[str] = None
    
    # Query-based evaluation fields
    queryRef: Optional[QueryRef] = None
    
    # Batch evaluation fields
    evaluations: Optional[List[EvaluationRef]] = None
    
    # Event evaluation fields
    rules: Optional[List[Dict[str, Any]]] = None

class UnifiedEvaluationRequest(BaseModel):
    """Unified request structure matching new CRD format"""
    type: EvaluationType = Field(..., description="Evaluation type")
    config: EvaluationConfig = Field(..., description="Type-specific configuration")
    parameters: Optional[Dict[str, str]] = Field(default_factory=dict, description="Evaluation parameters")
    evaluatorName: Optional[str] = Field(None, description="Name of the evaluator")
    model: Optional[Model] = None
    
    def get_config_for_type(self) -> Union[DirectEvaluationConfig, QueryBasedEvaluationConfig, BatchEvaluationConfig, None]:
        """Extract type-specific configuration"""
        if self.type == EvaluationType.DIRECT:
            return DirectEvaluationConfig(
                input=self.config.input or "",
                output=self.config.output or ""
            )
        elif self.type == EvaluationType.QUERY:
            return QueryBasedEvaluationConfig(
                queryRef=self.config.queryRef
            )
        elif self.type == EvaluationType.BATCH:
            return BatchEvaluationConfig(
                evaluations=self.config.evaluations or []
            )
        elif self.type == EvaluationType.EVENT:
            return EventEvaluationConfig(
                rules=self.config.rules or []
            )
        return None

# Compatibility aliases for backward compatibility
class MetricEvaluationRequest(BaseModel):
    """Compatibility wrapper for metric evaluation requests"""
    queryId: str
    input: str
    output: str
    model: Optional[Model] = None
    parameters: Optional[Dict[str, str]] = Field(default_factory=dict)
