"""
LLM Provider configuration and setup for multiple LLM providers.
Supports Azure OpenAI, OpenAI, Anthropic Claude, Google Gemini, Ollama.
"""

import logging
import os
from typing import Dict, Tuple, Any

logger = logging.getLogger(__name__)


class LLMProvider:
    """
    LLM Provider configuration and instance creation for multiple providers.
    """

    def _normalize_parameters(self, params: dict) -> dict:
        """
        Normalize parameters to support both langfuse.* and direct provider.* naming conventions.
        This maintains backward compatibility while supporting new parameter patterns.
        """
        normalized = params.copy()

        # Azure parameter mappings: azure.* -> langfuse.azure_*
        azure_mappings = {
            'azure.endpoint': 'langfuse.azure_endpoint',
            'azure.api_key': 'langfuse.azure_api_key',
            'azure.deployment_name': 'langfuse.azure_deployment',
            'azure.api_version': 'langfuse.model_version',
            'azure.embedding_deployment': 'langfuse.azure_embedding_deployment',
            'azure.embedding_model': 'langfuse.azure_embedding_model'
        }

        # OpenAI parameter mappings: openai.* -> langfuse.openai_*
        openai_mappings = {
            'openai.api_key': 'langfuse.openai_api_key',
            'openai.model': 'langfuse.model',
            'openai.base_url': 'langfuse.openai_base_url'
        }

        # Apply mappings if original langfuse.* parameter doesn't exist
        all_mappings = {**azure_mappings, **openai_mappings}

        for source_key, target_key in all_mappings.items():
            if source_key in params and target_key not in params:
                normalized[target_key] = params[source_key]
                logger.debug(f"Normalized parameter: {source_key} -> {target_key}")

        return normalized

    def detect_provider(self, params: dict) -> Tuple[str, dict]:
        """
        Detect the LLM provider based on parameters and return provider type and config.
        """
        # Normalize parameters to support both naming conventions
        normalized_params = self._normalize_parameters(params)

        # Azure OpenAI detection - check both langfuse.* and azure.* patterns
        if (any(key.startswith('langfuse.azure_') for key in normalized_params.keys()) or
            any(key.startswith('azure.') for key in params.keys())):
            return 'azure_openai', self._setup_azure_openai_config(normalized_params)
        
        # OpenAI detection - check both patterns
        if ('langfuse.openai_api_key' in normalized_params or
            'openai.api_key' in params or
            'OPENAI_API_KEY' in os.environ):
            return 'openai', self._setup_openai_config(normalized_params)

        # Anthropic Claude detection
        if 'langfuse.anthropic_api_key' in normalized_params or 'ANTHROPIC_API_KEY' in os.environ:
            return 'anthropic', self._setup_anthropic_config(normalized_params)

        # Google Gemini detection
        if any(key.startswith('langfuse.google_') for key in normalized_params.keys()) or 'GOOGLE_API_KEY' in os.environ:
            return 'google', self._setup_google_config(normalized_params)

        # Ollama detection
        if 'langfuse.ollama_base_url' in normalized_params or any(key.startswith('langfuse.ollama_') for key in normalized_params.keys()):
            return 'ollama', self._setup_ollama_config(normalized_params)

        # Fallback to Azure OpenAI if we have the expected parameters
        if (normalized_params.get('langfuse.azure_endpoint') or
            normalized_params.get('langfuse.azure_deployment') or
            params.get('azure.endpoint') or
            params.get('azure.deployment_name')):
            logger.warning("Falling back to Azure OpenAI configuration")
            return 'azure_openai', self._setup_azure_openai_config(normalized_params)

        # Default fallback
        logger.warning("No specific LLM provider detected, defaulting to OpenAI")
        return 'openai', self._setup_openai_config(normalized_params)
    
    def _setup_azure_openai_config(self, params: dict) -> dict:
        """Configure Azure OpenAI settings for evaluation."""
        config = {
            'provider': 'azure_openai',
            'api_base': params.get('langfuse.azure_endpoint'),
            'api_key': params.get('langfuse.azure_api_key'),
            'api_version': params.get('langfuse.model_version', '2024-02-01'),
            'deployment_name': params.get('langfuse.azure_deployment'),
            'model': params.get('langfuse.model', 'gpt-4')
        }
        logger.info(f"Azure OpenAI config: endpoint={config['api_base']}, deployment={config['deployment_name']}")
        return config
    
    def _setup_openai_config(self, params: dict) -> dict:
        """Configure OpenAI settings for evaluation."""
        config = {
            'provider': 'openai',
            'api_key': params.get('langfuse.openai_api_key') or os.environ.get('OPENAI_API_KEY'),
            'model': params.get('langfuse.model', 'gpt-4'),
            'base_url': params.get('langfuse.openai_base_url')
        }
        logger.info(f"OpenAI config: model={config['model']}")
        return config
    
    def _setup_anthropic_config(self, params: dict) -> dict:
        """Configure Anthropic Claude settings for evaluation."""
        config = {
            'provider': 'anthropic',
            'api_key': params.get('langfuse.anthropic_api_key') or os.environ.get('ANTHROPIC_API_KEY'),
            'model': params.get('langfuse.model', 'claude-3-sonnet-20240229'),
            'base_url': params.get('langfuse.anthropic_base_url')
        }
        logger.info(f"Anthropic config: model={config['model']}")
        return config
    
    def _setup_google_config(self, params: dict) -> dict:
        """Configure Google Gemini settings for evaluation."""
        config = {
            'provider': 'google',
            'api_key': params.get('langfuse.google_api_key') or os.environ.get('GOOGLE_API_KEY'),
            'model': params.get('langfuse.model', 'gemini-pro'),
            'project': params.get('langfuse.google_project'),
            'location': params.get('langfuse.google_location', 'us-central1')
        }
        logger.info(f"Google config: model={config['model']}")
        return config
    
    def _setup_ollama_config(self, params: dict) -> dict:
        """Configure Ollama settings for evaluation."""
        config = {
            'provider': 'ollama',
            'base_url': params.get('langfuse.ollama_base_url', 'http://localhost:11434'),
            'model': params.get('langfuse.model', 'llama3'),
        }
        logger.info(f"Ollama config: base_url={config['base_url']}, model={config['model']}")
        return config
    
    def create_instance(self, provider_type: str, llm_config: dict):
        """
        Create LLM instance based on provider type and configuration.
        """
        try:
            if provider_type == 'azure_openai':
                from langchain_openai import AzureChatOpenAI
                return AzureChatOpenAI(
                    model=llm_config['model'],
                    azure_endpoint=llm_config['api_base'],
                    azure_deployment=llm_config['deployment_name'],  # AzureChatOpenAI uses 'azure_deployment'
                    openai_api_version=llm_config['api_version'],
                    api_key=llm_config['api_key'],
                    temperature=0.0
                )
            
            elif provider_type == 'openai':
                from langchain_openai import ChatOpenAI
                return ChatOpenAI(
                    api_key=llm_config['api_key'],
                    model=llm_config['model'],
                    base_url=llm_config.get('base_url'),
                    temperature=0.0
                )
            
            elif provider_type == 'anthropic':
                from langchain_anthropic import ChatAnthropic
                return ChatAnthropic(
                    api_key=llm_config['api_key'],
                    model=llm_config['model'],
                    base_url=llm_config.get('base_url'),
                    temperature=0.0
                )
            
            elif provider_type == 'google':
                from langchain_google_genai import ChatGoogleGenerativeAI
                return ChatGoogleGenerativeAI(
                    google_api_key=llm_config['api_key'],
                    model=llm_config['model'],
                    temperature=0.0
                )
            
            elif provider_type == 'ollama':
                from langchain_community.llms import Ollama
                return Ollama(
                    base_url=llm_config['base_url'],
                    model=llm_config['model'],
                    temperature=0.0
                )
            
            else:
                logger.error(f"Unsupported provider type: {provider_type}")
                raise ValueError(f"Unsupported provider type: {provider_type}")
                
        except ImportError as e:
            logger.error(f"Missing dependency for {provider_type}: {e}")
            raise ImportError(f"Missing dependency for {provider_type}. Install the required package.")