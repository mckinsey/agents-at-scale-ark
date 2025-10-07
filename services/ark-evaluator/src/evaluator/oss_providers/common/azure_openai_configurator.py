"""
Azure OpenAI Configurator for managing Azure-specific configurations.
Handles environment variables, embeddings, and model configurations for Azure OpenAI.
"""

import os
import logging
from typing import Dict, Any, Optional, Tuple, List
from contextlib import contextmanager

logger = logging.getLogger(__name__)


class AzureOpenAIConfigurator:
    """
    Manages Azure OpenAI configurations including environment variables,
    embeddings, and model settings.
    """
    
    # Azure environment variable mappings
    ENV_MAPPINGS = {
        'langfuse.azure_api_key': 'AZURE_OPENAI_API_KEY',
        'langfuse.azure_endpoint': 'AZURE_OPENAI_ENDPOINT', 
        'langfuse.model_version': 'OPENAI_API_VERSION'
    }
    
    # Default embedding configurations
    DEFAULT_EMBEDDING_DEPLOYMENT = 'text-embedding-ada-002'
    DEFAULT_EMBEDDING_MODEL = 'text-embedding-ada-002'
    
    @staticmethod
    def extract_azure_env_vars(params: Dict[str, Any]) -> Dict[str, str]:
        """
        Extract Azure OpenAI environment variables from parameters.
        
        Args:
            params: Request parameters containing Azure configuration
            
        Returns:
            Dictionary of environment variable names and values
        """
        env_vars = {}
        
        for param_key, env_key in AzureOpenAIConfigurator.ENV_MAPPINGS.items():
            if param_key in params:
                env_vars[env_key] = params[param_key]
                logger.debug(f"Extracted {env_key} from {param_key}")
        
        if env_vars:
            logger.info(f"Extracted Azure environment variables: {list(env_vars.keys())}")
        
        return env_vars
    
    @staticmethod
    @contextmanager
    def azure_env_context(params: Dict[str, Any]):
        """
        Context manager for temporarily setting Azure OpenAI environment variables.
        
        Args:
            params: Request parameters containing Azure configuration
            
        Yields:
            List of environment variables that were set
        """
        env_vars = AzureOpenAIConfigurator.extract_azure_env_vars(params)
        env_vars_set = []
        
        try:
            # Set environment variables
            for key, value in env_vars.items():
                os.environ[key] = value
                env_vars_set.append(key)
            
            if env_vars_set:
                logger.info(f"Set Azure environment variables: {env_vars_set}")
            
            yield env_vars_set
            
        finally:
            # Clean up environment variables
            for var in env_vars_set:
                os.environ.pop(var, None)
            
            if env_vars_set:
                logger.info(f"Cleaned up Azure environment variables: {env_vars_set}")
    
    @staticmethod
    def create_azure_embeddings(
        llm_config: Dict[str, Any],
        params: Dict[str, Any]
    ) -> Optional[Any]:
        """
        Create Azure OpenAI embeddings with proper configuration.
        
        Args:
            llm_config: LLM configuration dictionary
            params: Request parameters
            
        Returns:
            Configured Azure embeddings wrapped for RAGAS, or None if creation fails
        """
        try:
            from langchain_openai import AzureOpenAIEmbeddings
            from ragas.embeddings import LangchainEmbeddingsWrapper
            
            # Get embedding deployment - fallback to default if not specified
            embedding_deployment = params.get(
                'langfuse.azure_embedding_deployment',
                AzureOpenAIConfigurator.DEFAULT_EMBEDDING_DEPLOYMENT
            )
            embedding_model = params.get(
                'langfuse.azure_embedding_model',
                AzureOpenAIConfigurator.DEFAULT_EMBEDDING_MODEL
            )
            
            # Log deployment information for debugging
            logger.info(f"Creating Azure embeddings:")
            logger.info(f"  LLM deployment: {llm_config.get('deployment_name', 'N/A')}")
            logger.info(f"  Embedding deployment: {embedding_deployment}")
            logger.info(f"  Embedding model: {embedding_model}")
            
            # Create Azure embeddings with explicit parameters (avoids env var conflicts)
            azure_embeddings = AzureOpenAIEmbeddings(
                model=embedding_model,
                azure_endpoint=llm_config['api_base'],
                deployment=embedding_deployment,
                openai_api_version=llm_config['api_version'],
                api_key=llm_config['api_key']
            )
            
            # Test embeddings connectivity
            try:
                test_embedding = azure_embeddings.embed_query("test")
                logger.info(f"✅ Embedding connectivity test successful, vector length: {len(test_embedding)}")
            except Exception as embed_test_e:
                logger.warning(f"⚠️ Embedding connectivity test failed: {embed_test_e}")
                # Still proceed as RAGAS might work differently
            
            # Wrap for RAGAS
            embeddings = LangchainEmbeddingsWrapper(azure_embeddings)
            logger.info("Successfully created Azure embeddings for RAGAS")
            
            return embeddings
            
        except ImportError as e:
            logger.error(f"Failed to import required libraries for Azure embeddings: {e}")
            return None
        except Exception as e:
            logger.warning(f"Failed to create Azure embeddings: {e}, will proceed without embeddings")
            return None
    
    @staticmethod
    def get_azure_config_from_params(params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Extract Azure OpenAI configuration from parameters.
        
        Args:
            params: Request parameters
            
        Returns:
            Dictionary containing Azure configuration
        """
        config = {}
        
        # Extract Azure-specific parameters
        azure_params = [
            ('langfuse.azure_api_key', 'api_key'),
            ('langfuse.azure_endpoint', 'api_base'),
            ('langfuse.azure_deployment', 'deployment_name'),
            ('langfuse.model_version', 'api_version'),
            ('langfuse.azure_embedding_deployment', 'embedding_deployment'),
            ('langfuse.azure_embedding_model', 'embedding_model')
        ]
        
        for param_key, config_key in azure_params:
            if param_key in params:
                config[config_key] = params[param_key]
        
        # Set defaults if not provided
        if 'embedding_deployment' not in config:
            config['embedding_deployment'] = AzureOpenAIConfigurator.DEFAULT_EMBEDDING_DEPLOYMENT
        if 'embedding_model' not in config:
            config['embedding_model'] = AzureOpenAIConfigurator.DEFAULT_EMBEDDING_MODEL
        
        logger.info(f"Extracted Azure configuration: {list(config.keys())}")
        return config
    
    @staticmethod
    async def test_azure_connectivity(
        langchain_llm: Any,
        embeddings: Optional[Any] = None
    ) -> Tuple[bool, bool]:
        """
        Test connectivity for Azure LLM and embeddings.
        
        Args:
            langchain_llm: The LangChain LLM instance
            embeddings: Optional embeddings instance
            
        Returns:
            Tuple of (llm_success, embeddings_success)
        """
        llm_success = False
        embeddings_success = False
        
        # Test LLM connectivity
        try:
            test_response = await langchain_llm.agenerate([["Test connectivity"]])
            logger.info(f"LLM connectivity test successful: {len(test_response.generations[0])} responses")
            llm_success = True
        except Exception as test_e:
            logger.warning(f"LLM connectivity test failed: {test_e}")
        
        # Test embeddings connectivity if provided
        if embeddings:
            try:
                # Extract the underlying embeddings object
                if hasattr(embeddings, 'embeddings'):
                    underlying_embeddings = embeddings.embeddings
                else:
                    underlying_embeddings = embeddings
                
                if hasattr(underlying_embeddings, 'embed_query'):
                    test_embedding = underlying_embeddings.embed_query("test")
                    logger.info(f"Embeddings connectivity test successful, vector length: {len(test_embedding)}")
                    embeddings_success = True
            except Exception as embed_e:
                logger.warning(f"Embeddings connectivity test failed: {embed_e}")
        
        return llm_success, embeddings_success
    
    @staticmethod
    def validate_azure_params(params: Dict[str, Any]) -> Tuple[bool, List[str]]:
        """
        Validate that required Azure parameters are present.
        
        Args:
            params: Request parameters
            
        Returns:
            Tuple of (is_valid, missing_params)
        """
        required_params = [
            'langfuse.azure_api_key',
            'langfuse.azure_endpoint',
            'langfuse.azure_deployment'
        ]
        
        missing = []
        for param in required_params:
            if param not in params or not params[param]:
                missing.append(param)
        
        is_valid = len(missing) == 0
        
        if not is_valid:
            logger.warning(f"Missing required Azure parameters: {missing}")
        
        return is_valid, missing