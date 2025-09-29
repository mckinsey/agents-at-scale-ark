import aiohttp
import json
import logging
from typing import Dict, Any, Union, Tuple
from .types import EvaluationParameters, Model, TokenUsage
from .model_resolver import ModelConfig

logger = logging.getLogger(__name__)


class LLMClient:
    def __init__(self, session=None):
        self.session = session
        self._session_lock = None
        self._owns_session = session is None
    
    async def _get_session(self):
        if self.session is None:
            if self._session_lock is None:
                import asyncio
                self._session_lock = asyncio.Lock()

            async with self._session_lock:
                if self.session is None:
                    timeout = aiohttp.ClientTimeout(total=30, connect=10, sock_connect=10, sock_read=10)
                    connector = aiohttp.TCPConnector(
                        force_close=True,
                        enable_cleanup_closed=True,
                        ttl_dns_cache=0  # Disable DNS caching
                    )
                    self.session = aiohttp.ClientSession(timeout=timeout, connector=connector)
        return self.session
    
    async def close(self):
        if self.session and self._owns_session:
            await self.session.close()
            self.session = None
    
    async def evaluate(self, prompt: str, model: Union[Model, ModelConfig], params: EvaluationParameters) -> Tuple[str, TokenUsage]:
        """
        Call the model to evaluate the prompt and return content with token usage
        Returns: (content, token_usage)
        """
        # Handle both Model and ModelConfig objects
        if isinstance(model, ModelConfig):
            # Determine model type from base_url
            if 'azure' in model.base_url.lower():
                return await self._call_azure_openai_config(prompt, model, params)
            else:
                return await self._call_openai_compatible_config(prompt, model, params)
        else:
            # Legacy Model object support
            model_type = model.type
            if model_type == 'openai':
                return await self._call_openai_compatible(prompt, model, params)
            elif model_type == 'azure':
                return await self._call_azure_openai(prompt, model, params)
            else:
                raise ValueError(f"Unsupported model type: {model_type}")
    
    async def _call_openai_compatible(self, prompt: str, model: Model, params: EvaluationParameters) -> Tuple[str, TokenUsage]:
        """
        Call OpenAI-compatible API
        """
        session = await self._get_session()
        
        # Extract model configuration
        url = model.config.get('base_url', '')
        model_name = model.name
        api_key = model.config.get('api_key', '')

        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {api_key}'
        }
        
        payload = {
            'model': model_name,
            'messages': [
                {'role': 'user', 'content': prompt}
            ],
            'temperature': params.temperature or 0.1,  # Low temperature for consistent evaluation
            'max_tokens': params.max_tokens or 1000
        }
        
        logger.info(f"Calling OpenAI-compatible API: {url}")
        
        async with session.post(url, headers=headers, json=payload) as response:
            if response.status != 200:
                error_text = await response.text()
                raise Exception(f"API call failed with status {response.status}: {error_text}")
            
            result = await response.json()
            content = result['choices'][0]['message']['content']
            
            # Extract token usage
            usage = result.get('usage', {})
            token_usage = TokenUsage(
                promptTokens=usage.get('prompt_tokens', 0),
                completionTokens=usage.get('completion_tokens', 0),
                totalTokens=usage.get('total_tokens', 0)
            )
            
            return content, token_usage
    
    async def _call_azure_openai(self, prompt: str, model: Model, params: EvaluationParameters) -> Tuple[str, TokenUsage]:
        """
        Call Azure OpenAI API
        """
        session = await self._get_session()
        
        # Extract Azure-specific configuration
        url = model.config.get('base_url', '')
        api_key = model.config.get('api_key', '')
        deployment_name = model.name
        api_version = model.config.get('api_version', '')
        
        # Build Azure OpenAI URL
        full_url = f"{url}/openai/deployments/{deployment_name}/chat/completions?api-version={api_version}"
        
        headers = {
            'Content-Type': 'application/json',
            'api-key': api_key
        }
        
        payload = {
            'messages': [
                {'role': 'user', 'content': prompt}
            ],
            'temperature': params.temperature or 0.1,  # Low temperature for consistent evaluation
            'max_tokens': params.max_tokens or 1000
        }
        
        logger.info(f"Calling Azure OpenAI API: {full_url}")
        
        async with session.post(full_url, headers=headers, json=payload) as response:
            if response.status != 200:
                error_text = await response.text()
                raise Exception(f"Azure API call failed with status {response.status}: {error_text}")
            
            result = await response.json()
            content = result['choices'][0]['message']['content']
            
            # Extract token usage
            usage = result.get('usage', {})
            token_usage = TokenUsage(
                promptTokens=usage.get('prompt_tokens', 0),
                completionTokens=usage.get('completion_tokens', 0),
                totalTokens=usage.get('total_tokens', 0)
            )
            
            return content, token_usage
    
    async def _call_openai_compatible_config(self, prompt: str, model: ModelConfig, params: EvaluationParameters) -> Tuple[str, TokenUsage]:
        """
        Call OpenAI-compatible API using ModelConfig
        """
        session = await self._get_session()
        
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {model.api_key}'
        }
        
        # Ensure the base_url ends with the chat/completions endpoint
        url = model.base_url
        if not url.endswith('/chat/completions'):
            url = url.rstrip('/') + '/chat/completions'
        
        payload = {
            'model': model.model,
            'messages': [
                {'role': 'user', 'content': prompt}
            ],
            'temperature': params.temperature or 0.1,  # Low temperature for consistent evaluation
            'max_tokens': params.max_tokens or 1000
        }
        
        logger.info(f"Calling OpenAI-compatible API: {url} with model {model.model}")
        
        async with session.post(url, headers=headers, json=payload) as response:
            if response.status != 200:
                error_text = await response.text()
                raise Exception(f"API call failed with status {response.status}: {error_text}")
            
            result = await response.json()
            content = result['choices'][0]['message']['content']
            
            # Extract token usage
            usage = result.get('usage', {})
            token_usage = TokenUsage(
                promptTokens=usage.get('prompt_tokens', 0),
                completionTokens=usage.get('completion_tokens', 0),
                totalTokens=usage.get('total_tokens', 0)
            )
            
            return content, token_usage
    
    async def _call_azure_openai_config(self, prompt: str, model: ModelConfig, params: EvaluationParameters) -> Tuple[str, TokenUsage]:
        """
        Call Azure OpenAI API using ModelConfig
        """
        session = await self._get_session()
        
        # For Azure, the model.model is the deployment name
        deployment_name = model.model
        
        # Build Azure OpenAI URL
        base_url = model.base_url.rstrip('/')
        full_url = f"{base_url}/openai/deployments/{deployment_name}/chat/completions?api-version={model.api_version}"
        
        headers = {
            'Content-Type': 'application/json',
            'api-key': model.api_key
        }
        
        payload = {
            'messages': [
                {'role': 'user', 'content': prompt}
            ],
            'temperature': params.temperature or 0.1,  # Low temperature for consistent evaluation
            'max_tokens': params.max_tokens or 1000
        }
        
        logger.info(f"Calling Azure OpenAI API: {full_url} with deployment {deployment_name}")
        
        async with session.post(full_url, headers=headers, json=payload) as response:
            if response.status != 200:
                error_text = await response.text()
                raise Exception(f"Azure API call failed with status {response.status}: {error_text}")
            
            result = await response.json()
            content = result['choices'][0]['message']['content']
            
            # Extract token usage
            usage = result.get('usage', {})
            token_usage = TokenUsage(
                promptTokens=usage.get('prompt_tokens', 0),
                completionTokens=usage.get('completion_tokens', 0),
                totalTokens=usage.get('total_tokens', 0)
            )
            
            return content, token_usage