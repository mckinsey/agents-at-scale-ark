"""
Interface for OSS evaluation providers.
Separate from the ARK provider base to maintain clear boundaries.
"""

from abc import ABC, abstractmethod
from typing import List, Optional
import logging

from ..types import UnifiedEvaluationRequest, EvaluationResponse

logger = logging.getLogger(__name__)


class OSSEvaluationProvider(ABC):
    """
    Abstract base class for OSS platform evaluation providers.
    This is separate from the ARK EvaluationProvider to maintain clear separation.
    """
    
    def __init__(self, shared_session=None):
        self.shared_session = shared_session
        
    @abstractmethod
    async def evaluate(self, request: UnifiedEvaluationRequest) -> EvaluationResponse:
        """
        Execute the evaluation for this OSS platform.
        
        Args:
            request: The unified evaluation request
            
        Returns:
            EvaluationResponse with score, passed status, and metadata
        """
        pass
    
    @abstractmethod
    def get_evaluation_type(self) -> str:
        """
        Return the OSS platform identifier.
        
        Returns:
            String identifier for the platform (e.g., "langfuse", "ragas")
        """
        pass
    
    @abstractmethod
    def get_required_parameters(self) -> List[str]:
        """
        Get list of required parameters for this provider.
        
        Returns:
            List of required parameter names
        """
        pass
    
    def validate_parameters(self, parameters: Optional[dict]) -> bool:
        """
        Validate that required parameters are present.
        
        Args:
            parameters: Parameters dictionary
            
        Returns:
            True if all required parameters are present
        """
        if not parameters:
            return False
            
        required = self.get_required_parameters()
        for param in required:
            if param not in parameters:
                logger.warning(f"Missing required parameter: {param}")
                return False
        return True