"""
Evaluation manager that orchestrates between ARK providers and OSS platforms.
"""

import logging
from typing import Dict, Optional, List
from .interface import OSSEvaluationProvider
from ..types import UnifiedEvaluationRequest, EvaluationResponse
from ..providers import EvaluationProviderFactory

logger = logging.getLogger(__name__)


class EvaluationManager:
    """
    Unified manager that routes between ARK's native providers and OSS platforms.
    Preserves existing factory pattern while adding OSS platform support.
    """
    
    def __init__(self, shared_session=None):
        self.shared_session = shared_session
        self.oss_providers: Dict[str, OSSEvaluationProvider] = {}
        self.ark_factory = EvaluationProviderFactory  # Use existing factory
        self._initialize_oss_providers()
    
    def _initialize_oss_providers(self):
        """
        Register OSS platform providers.
        Lazy loading to avoid dependency issues.
        """
        # Try to register Langfuse
        try:
            from ..oss_providers.langfuse.langfuse import LangfuseProvider
            self.register_oss_provider('langfuse', LangfuseProvider)
            logger.info("Registered LangfuseProvider")
        except ImportError as e:
            logger.debug(f"Could not register LangfuseProvider: {e}")

        # Try to register RAGAS
        try:
            from ..oss_providers.ragas.ragas_provider import RagasProvider
            self.register_oss_provider('ragas', RagasProvider)
            logger.info("Registered RagasProvider")
        except ImportError as e:
            logger.error(f"Could not register RagasProvider: {e}")
        except Exception as e:
            logger.error(f"Unexpected error registering RagasProvider: {e}")
        
    
    def register_oss_provider(self, name: str, provider_class: type):
        """
        Register an OSS platform provider.
        
        Args:
            name: Provider name/identifier  
            provider_class: Provider class to instantiate
        """
        try:
            self.oss_providers[name] = provider_class(shared_session=self.shared_session)
            logger.info(f"Registered OSS provider: {name}")
        except Exception as e:
            logger.error(f"Failed to register OSS provider {name}: {e}")
    
    def get_oss_provider(self, provider_name: str) -> Optional[OSSEvaluationProvider]:
        """
        Get a registered OSS provider by name.
        
        Args:
            provider_name: Name of the provider
            
        Returns:
            OSSEvaluationProvider instance or None if not found
        """
        return self.oss_providers.get(provider_name)
    
    def list_oss_providers(self) -> List[str]:
        """
        List all registered OSS provider names.
        
        Returns:
            List of OSS provider names
        """
        return list(self.oss_providers.keys())
    
    def list_ark_types(self) -> List[str]:
        """
        List all available ARK evaluation types.
        
        Returns:
            List of ARK evaluation type names
        """
        return self.ark_factory.get_registered_types()
    
    async def evaluate(self, request: UnifiedEvaluationRequest) -> EvaluationResponse:
        """
        Route evaluation request to appropriate provider.
        
        Args:
            request: Unified evaluation request
            
        Returns:
            EvaluationResponse from the selected provider
        """
        # Check for explicit provider parameter
        provider_name = request.parameters.get('provider', 'ark') if request.parameters else 'ark'
        
        logger.info(f"Routing evaluation to provider: {provider_name}, type: {request.type}")
        
        # Route to OSS provider if specified
        if provider_name in self.oss_providers:
            logger.info(f"Using OSS provider: {provider_name}")
            provider = self.oss_providers[provider_name]
            
            # Validate required parameters
            if not provider.validate_parameters(request.parameters):
                raise ValueError(f"Missing required parameters for {provider_name} provider")
            
            return await provider.evaluate(request)
        
        # Otherwise use ARK's native providers via factory
        if provider_name == 'ark' or provider_name == 'default':
            logger.info(f"Using ARK native provider for type: {request.type}")
            ark_provider = self.ark_factory.create(
                request.type, 
                shared_session=self.shared_session
            )
            return await ark_provider.evaluate(request)
        
        # Unknown provider
        available = ['ark', 'default'] + list(self.oss_providers.keys())
        raise ValueError(f"Unknown provider: {provider_name}. Available: {available}")