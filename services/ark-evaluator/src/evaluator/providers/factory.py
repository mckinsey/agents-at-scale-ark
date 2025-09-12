from typing import Dict, Type
import logging

from .base import EvaluationProvider
from ..types import EvaluationType

logger = logging.getLogger(__name__)


class EvaluationProviderFactory:
    """
    Factory class for creating evaluation providers based on evaluation type.
    """
    
    _providers: Dict[str, Type[EvaluationProvider]] = {}
    
    @classmethod
    def register(cls, evaluation_type: str, provider_class: Type[EvaluationProvider]):
        """
        Register an evaluation provider for a specific type.
        
        Args:
            evaluation_type: The evaluation type identifier
            provider_class: The provider class to handle this type
        """
        cls._providers[evaluation_type] = provider_class
        logger.info(f"Registered evaluation provider for type '{evaluation_type}': {provider_class.__name__}")
    
    @classmethod
    def create(cls, evaluation_type: EvaluationType, shared_session=None) -> EvaluationProvider:
        """
        Create an evaluation provider instance for the specified type.
        
        Args:
            evaluation_type: The type of evaluation to handle
            shared_session: Optional shared HTTP session
            
        Returns:
            EvaluationProvider instance
            
        Raises:
            ValueError: If no provider is registered for the evaluation type
        """
        type_str = evaluation_type.value if hasattr(evaluation_type, 'value') else str(evaluation_type)
        
        if type_str not in cls._providers:
            available_types = list(cls._providers.keys())
            raise ValueError(f"No provider registered for evaluation type '{type_str}'. Available types: {available_types}")
        
        provider_class = cls._providers[type_str]
        logger.info(f"Creating provider for type '{type_str}': {provider_class.__name__}")
        
        return provider_class(shared_session=shared_session)
    
    @classmethod
    def get_registered_types(cls) -> list[str]:
        """
        Get list of all registered evaluation types.
        
        Returns:
            List of registered evaluation type identifiers
        """
        return list(cls._providers.keys())