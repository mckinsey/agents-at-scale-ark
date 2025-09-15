from abc import ABC, abstractmethod
from typing import Optional
import logging

from ..types import UnifiedEvaluationRequest, EvaluationResponse

logger = logging.getLogger(__name__)


class EvaluationProvider(ABC):
    """
    Abstract base class for evaluation providers.
    Each evaluation type (direct, query, baseline, batch, event) should implement this interface.
    """
    
    def __init__(self, shared_session=None):
        self.shared_session = shared_session
        
    @abstractmethod
    async def evaluate(self, request: UnifiedEvaluationRequest) -> EvaluationResponse:
        """
        Execute the evaluation for this provider's specific type.
        
        Args:
            request: The unified evaluation request containing all necessary parameters
            
        Returns:
            EvaluationResponse with score, passed status, and metadata
            
        Raises:
            HTTPException: For validation errors or processing failures
        """
        pass
    
    @abstractmethod
    def get_evaluation_type(self) -> str:
        """
        Return the evaluation type this provider handles.
        
        Returns:
            String identifier for the evaluation type (e.g., "direct", "baseline")
        """
        pass
    
    def _extract_model_ref(self, parameters: Optional[dict]):
        """
        Helper method to extract model reference from parameters.
        """
        logger.info(f"_extract_model_ref called with parameters: {parameters}")
        if not parameters:
            logger.warning("No parameters provided to _extract_model_ref")
            return None
            
        # Log all parameter keys for debugging
        logger.info(f"Available parameter keys: {list(parameters.keys()) if parameters else 'None'}")
        
        # Check for model.name specifically
        if "model.name" in parameters:
            logger.info(f"Found model.name parameter: {parameters['model.name']}")
        else:
            logger.warning("model.name parameter not found in parameters")
            
        # Check for model.namespace specifically  
        if "model.namespace" in parameters:
            logger.info(f"Found model.namespace parameter: {parameters['model.namespace']}")
        else:
            logger.warning("model.namespace parameter not found in parameters")
            
        from ..types import ModelRef
        model_name = parameters.get("model.name", "default")
        model_namespace = parameters.get("model.namespace")
        
        logger.info(f"Extracted model config: name={model_name}, namespace={model_namespace}")
        return ModelRef(name=model_name, namespace=model_namespace)
    
    def _extract_golden_examples(self, parameters: Optional[dict]):
        """
        Helper method to extract and parse golden examples from parameters.
        """
        if not parameters or "golden-examples" not in parameters:
            return None
            
        import json
        from ..types import GoldenExample
        
        try:
            golden_data = json.loads(parameters["golden-examples"])
            golden_examples = []
            
            for example_data in golden_data:
                example = GoldenExample(
                    input=example_data.get("input", ""),
                    expectedOutput=example_data.get("expectedOutput", ""),
                    metadata=example_data.get("metadata", {}),
                    expectedMinScore=example_data.get("expectedMinScore"),
                    difficulty=example_data.get("difficulty"),
                    category=example_data.get("category")
                )
                golden_examples.append(example)
                
            logger.info(f"Extracted {len(golden_examples)} golden examples")
            return golden_examples
            
        except Exception as e:
            logger.warning(f"Failed to parse golden examples: {e}")
            return None