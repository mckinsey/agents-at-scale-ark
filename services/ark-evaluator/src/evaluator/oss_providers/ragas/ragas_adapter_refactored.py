"""
RAGAS-based LLM evaluation adapter for Langfuse integration (Refactored).
Supports multiple LLM providers with improved separation of concerns.
"""

import logging
from typing import Dict, List, Any
from ...types import EvaluationParameters


class RagasEvaluationError(Exception):
    """Custom exception for RAGAS evaluation failures."""

    def __init__(self, message: str, error_type: str = "evaluation_error", original_error: Exception = None):
        super().__init__(message)
        self.message = message
        self.error_type = error_type
        self.original_error = original_error

    def to_dict(self) -> Dict[str, Any]:
        """Convert error to dictionary for response formatting."""
        return {
            "error": self.message,
            "error_type": self.error_type,
            "original_error": str(self.original_error) if self.original_error else None
        }
from ..common.uvloop_handler import UVLoopHandler
from ..common.azure_openai_configurator import AzureOpenAIConfigurator
from .ragas_evaluator import RagasEvaluator
from ..common.llm_provider import LLMProvider

logger = logging.getLogger(__name__)


class RagasAdapter:
    """
    RAGAS adapter with improved separation of concerns.
    Delegates UV loop handling, Azure configuration, and RAGAS evaluation to specialized classes.
    """
    
    def __init__(self):
        self.llm_provider = LLMProvider()
        self.uvloop_handler = UVLoopHandler()
        self.azure_configurator = AzureOpenAIConfigurator()
        self.ragas_evaluator = RagasEvaluator()
        # Initialize validation results
        self._validation_results = {
            'valid_metrics': [],
            'invalid_metrics': [],
            'validation_errors': {}
        }
    
    async def evaluate(
        self,
        input_text: str,
        output_text: str,
        metrics: List[str],
        params: dict
    ) -> Dict[str, float]:
        """
        Run RAGAS evaluation with proper UV loop handling and Azure configuration.
        
        Args:
            input_text: Input text to evaluate
            output_text: Output text to evaluate
            metrics: List of metrics to compute
            params: Evaluation parameters
            
        Returns:
            Dictionary of metric scores
        """
        try:
            # Use UVLoopHandler to determine execution strategy
            if self.uvloop_handler.detect_uvloop():
                logger.info("Detected uvloop, delegating to thread-safe execution")
                return await self._run_with_uvloop_handling(
                    input_text, output_text, metrics, params
                )
            else:
                # No uvloop, run directly
                return await self._run_evaluation(
                    input_text, output_text, metrics, params
                )
                
        except ImportError as e:
            logger.error(f"RAGAS dependencies not available: {e}")
            raise RagasEvaluationError(
                f"RAGAS dependencies not available: {e}",
                error_type="import_error",
                original_error=e
            )
        except Exception as e:
            logger.error(f"RAGAS evaluation failed: {e}")
            raise RagasEvaluationError(
                f"RAGAS evaluation failed: {e}",
                error_type="evaluation_error",
                original_error=e
            )
    
    async def _run_with_uvloop_handling(
        self,
        input_text: str,
        output_text: str,
        metrics: List[str],
        params: dict
    ) -> Dict[str, float]:
        """
        Run evaluation with UV loop handling in a separate thread.
        """
        # Extract Azure environment variables if needed
        env_vars = self.azure_configurator.extract_azure_env_vars(params)
        
        # Create a wrapper function for thread execution
        def run_in_thread():
            import asyncio
            
            # Create clean event loop
            loop = self.uvloop_handler.create_clean_event_loop()
            
            try:
                # Run evaluation in the clean loop
                return loop.run_until_complete(
                    self._run_evaluation(input_text, output_text, metrics, params)
                )
            finally:
                loop.close()
        
        # Wrap the function with environment variables if needed
        if env_vars:
            wrapped_func = self.uvloop_handler.wrap_sync_for_thread(
                run_in_thread, env_vars
            )
            return self.uvloop_handler.run_in_thread_with_clean_loop(wrapped_func)
        else:
            return self.uvloop_handler.run_in_thread_with_clean_loop(run_in_thread)
    
    async def _run_evaluation(
        self,
        input_text: str,
        output_text: str,
        metrics: List[str],
        params: dict
    ) -> Dict[str, float]:
        """
        Core RAGAS evaluation logic.
        """
        try:
            # Detect LLM provider and get config
            provider_type, llm_config = self.llm_provider.detect_provider(params)
            logger.info(f"Detected LLM provider: {provider_type}")
            
            # Create LLM instance
            langchain_llm = self.llm_provider.create_instance(provider_type, llm_config)
            
            # Wrap LLM for RAGAS
            from ragas.llms import LangchainLLMWrapper
            llm = LangchainLLMWrapper(langchain_llm)
            logger.info(f"Wrapped {provider_type} LLM for RAGAS")
            
            # Create embeddings if using Azure
            embeddings = None
            if provider_type == 'azure_openai':
                embeddings = self.azure_configurator.create_azure_embeddings(
                    llm_config, params
                )
            
            # Test connectivity
            llm_ok, embed_ok = await self.azure_configurator.test_azure_connectivity(
                langchain_llm, embeddings
            )
            if not llm_ok:
                logger.warning("LLM connectivity test failed, but continuing")
            
            # Initialize RAGAS metrics
            ragas_metrics = self.ragas_evaluator.initialize_ragas_metrics(
                metrics, llm, embeddings
            )
            
            # Extract context from parameters
            eval_params = EvaluationParameters.from_request_params(params)

            # Prepare dataset with metric-specific fields
            dataset = self.ragas_evaluator.prepare_dataset(
                input_text,
                output_text,
                eval_params.context,
                eval_params.context_source,
                metrics=metrics,
                ground_truth=params.get('ground_truth')
            )

            # Validate field requirements and filter metrics
            # Extract the first row from the dataset for validation
            dataset_dict = {}
            if dataset and len(dataset) > 0:
                dataset_dict = dict(dataset[0])  # Convert first row to dictionary

            valid_metrics, invalid_metrics, validation_errors = self.ragas_evaluator.validate_and_filter_metrics(
                metrics, dataset_dict
            )

            # Store validation results for later use in metadata
            self._validation_results = {
                'valid_metrics': valid_metrics,
                'invalid_metrics': invalid_metrics,
                'validation_errors': validation_errors
            }

            # If no metrics can be evaluated, raise validation error
            if not valid_metrics:
                error_details = []
                for metric, errors in validation_errors.items():
                    error_details.append(f"{metric}: {', '.join(errors)}")

                raise RagasEvaluationError(
                    f"No metrics can be evaluated due to validation failures: {'; '.join(error_details)}",
                    error_type="validation_error"
                )

            # Only initialize RAGAS metrics for valid metrics
            ragas_metrics = self.ragas_evaluator.initialize_ragas_metrics(
                valid_metrics, llm, embeddings
            )

            # Run RAGAS evaluation on valid metrics only
            result = await self.ragas_evaluator.run_evaluation(
                dataset, ragas_metrics
            )

            # Extract scores only for valid metrics
            return self.ragas_evaluator.extract_scores(result, metrics, valid_metrics)
            
        except Exception as e:
            logger.error(f"Error in RAGAS evaluation: {e}")
            raise RagasEvaluationError(
                f"Error in RAGAS evaluation: {e}",
                error_type="evaluation_error",
                original_error=e
            )

    def get_validation_results(self) -> Dict[str, Any]:
        """
        Get the last validation results from field validation.

        Returns:
            Dictionary containing validation results
        """
        return self._validation_results.copy()