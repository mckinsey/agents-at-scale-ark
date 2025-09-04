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
    input: str
    responses: List[Response]
    query: Dict[str, Any]
    modelRef: Optional[ModelRef] = None  # Reference instead of inline model

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
    ALL = "all"

class EvaluationParameters(BaseModel):
    scope: Optional[str] = Field(default="all", description="Evaluation scope")
    min_score: float = Field(default=0.7, ge=0.0, le=1.0, description="Minimum score threshold")
    
    # Extensible parameters
    max_tokens: Optional[int] = Field(default=None, gt=0, description="Maximum tokens for evaluation")
    temperature: Optional[float] = Field(default=0.0, ge=0.0, le=2.0, description="LLM temperature")
    evaluation_criteria: Optional[list[str]] = Field(default=None, description="Specific criteria to evaluate")
    custom_metadata: Optional[Dict[str, Any]] = Field(default=None, description="Custom metadata")
    
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
            "max-tokens": "max_tokens",
            "max_tokens": "max_tokens",
            "temperature": "temperature",
            "evaluation-criteria": "evaluation_criteria",
            "evaluation_criteria": "evaluation_criteria",
            "custom-metadata": "custom_metadata",
            "custom_metadata": "custom_metadata"
        }
        
        normalized_params = {}
        for key, value in params.items():
            if key in param_mapping:
                normalized_params[param_mapping[key]] = value
            else:
                # Unknown parameters go to custom_metadata
                if "custom_metadata" not in normalized_params:
                    normalized_params["custom_metadata"] = {}
                normalized_params["custom_metadata"][key] = value
        
        try:
            return cls(**normalized_params)
        except Exception as e:
            logger.warning(f"Invalid parameters provided: {e}. Using defaults.")
            return cls()
    
    def get_scope_list(self) -> List[str]:
        """Get scope as a list of individual scope values"""
        if not self.scope or self.scope == "all":
            return [scope.value for scope in EvaluationScope if scope.value != "all"]
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
