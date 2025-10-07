"""
Standalone RAGAS evaluation provider.
Direct integration with RAGAS library without Langfuse dependencies.
"""

import logging
from typing import List, Optional, Dict, Any
import time

from ...types import UnifiedEvaluationRequest, EvaluationResponse, TokenUsage
from ...core.interface import OSSEvaluationProvider

logger = logging.getLogger(__name__)


class RagasProvider(OSSEvaluationProvider):
    """
    Standalone RAGAS evaluation provider.

    Provides direct integration with RAGAS library for LLM evaluation
    without requiring Langfuse dependencies.
    """

    def __init__(self, shared_session=None):
        super().__init__(shared_session)
        self._ragas_adapter = None

    def get_evaluation_type(self) -> str:
        """Return the evaluation type identifier."""
        return "ragas"

    def get_required_parameters(self) -> List[str]:
        """
        Get list of required parameters for RAGAS evaluation.

        Supports both Azure OpenAI and OpenAI configurations.
        """
        return [
            # Either Azure OpenAI configuration
            "azure.api_key", "azure.endpoint", "azure.api_version",
            # Or OpenAI configuration
            "openai.api_key", "openai.base_url"
        ]

    def validate_parameters(self, parameters: Optional[dict]) -> bool:
        """
        Validate that required parameters are present for either Azure or OpenAI.

        Args:
            parameters: Parameters dictionary

        Returns:
            True if valid configuration is present
        """
        if not parameters:
            return False

        # Check for Azure configuration
        azure_params = ["azure.api_key", "azure.endpoint", "azure.api_version"]
        has_azure = all(param in parameters for param in azure_params)

        # Check for OpenAI configuration
        openai_params = ["openai.api_key", "openai.base_url"]
        has_openai = all(param in parameters for param in openai_params)

        return has_azure or has_openai

    async def evaluate(self, request: UnifiedEvaluationRequest) -> EvaluationResponse:
        """
        Execute RAGAS evaluation.

        Args:
            request: The unified evaluation request

        Returns:
            EvaluationResponse with score and metadata
        """
        start_time = time.time()

        try:
            # Validate parameters
            if not self.validate_parameters(request.parameters):
                return EvaluationResponse(
                    score="0.0",
                    passed=False,
                    error="Missing required parameters for RAGAS evaluation",
                    metadata={
                        "provider": "ragas",
                        "required_azure": "azure.api_key,azure.endpoint,azure.api_version",
                        "required_openai": "openai.api_key,openai.base_url",
                        "provided": ",".join(request.parameters.keys()) if request.parameters else "none"
                    }
                )

            # Extract input/output from config
            input_text = request.config.input or ""
            output_text = request.config.output or ""

            if not input_text or not output_text:
                return EvaluationResponse(
                    score="0.0",
                    passed=False,
                    error="Missing input or output text for evaluation",
                    metadata={
                        "provider": "ragas",
                        "input_length": str(len(input_text)),
                        "output_length": str(len(output_text))
                    }
                )

            # Parse metrics from parameters
            # Check for evaluation_criteria first (standard param), then metrics (backward compat)
            if request.parameters and "evaluation_criteria" in request.parameters:
                criteria = request.parameters["evaluation_criteria"]
                # Convert list to comma-separated string if needed
                if isinstance(criteria, list):
                    metrics_str = ",".join(criteria)
                else:
                    metrics_str = criteria
            else:
                # Fallback to metrics parameter or default
                metrics_str = request.parameters.get("metrics", "relevance,correctness") if request.parameters else "relevance,correctness"

            metrics = self._parse_metrics(metrics_str)

            # Get RAGAS adapter and run evaluation
            adapter = self._get_ragas_adapter()
            try:
                scores = await adapter.evaluate(input_text, output_text, metrics, request.parameters or {})
            except Exception as e:
                # Check if it's our custom RagasEvaluationError
                if hasattr(e, 'error_type') and hasattr(e, 'message'):
                    # It's a RagasEvaluationError
                    execution_time = time.time() - start_time
                    error_dict = e.to_dict() if hasattr(e, 'to_dict') else {"error": str(e)}

                    return EvaluationResponse(
                        score=None,
                        passed=False,
                        error=error_dict.get("error", str(e)),
                        metadata={
                            "provider": "ragas",
                            "error_type": getattr(e, 'error_type', 'unknown'),
                            "execution_time_seconds": str(execution_time),
                            "requested_metrics": ",".join(metrics),
                            "original_error": error_dict.get("original_error") if error_dict.get("original_error") else None
                        }
                    )
                else:
                    # Unknown exception, re-raise
                    raise

            # Get validation results for metadata
            validation_results = adapter.get_validation_results()

            # Calculate overall score
            if not scores:
                # Still include validation results in metadata even when no scores
                execution_time = time.time() - start_time
                metadata = {
                    "provider": "ragas",
                    "execution_time_seconds": str(execution_time)
                }

                # Add validation results to metadata
                if validation_results:
                    metadata.update({
                        "requested_metrics": ",".join(metrics),
                        "valid_metrics": ",".join(validation_results.get('valid_metrics', [])),
                        "invalid_metrics": ",".join(validation_results.get('invalid_metrics', [])),
                        "validation_summary": f"{len(validation_results.get('valid_metrics', []))} successful, {len(validation_results.get('invalid_metrics', []))} failed"
                    })

                    # Add specific validation errors if any
                    if validation_results.get('validation_errors'):
                        import json
                        metadata["validation_errors"] = json.dumps(validation_results['validation_errors'])

                        # Add information about failed metrics
                        if validation_results.get('invalid_metrics'):
                            failed_metrics_info = {}
                            for metric in validation_results['invalid_metrics']:
                                error = validation_results['validation_errors'].get(metric, 'validation failed')
                                failed_metrics_info[metric] = error
                            metadata["failed_metrics"] = json.dumps(failed_metrics_info)

                return EvaluationResponse(
                    score="0.0",
                    passed=False,
                    error="No scores returned from RAGAS evaluation",
                    metadata=metadata
                )

            overall_score = sum(scores.values()) / len(scores)

            # Get threshold
            threshold = float(request.parameters.get("threshold", "0.7")) if request.parameters else 0.7

            # Calculate execution time
            execution_time = time.time() - start_time

            # Build metadata (all values must be strings for EvaluationResponse)
            model_info = self._extract_model_info(request.parameters or {})
            metadata = {
                "provider": "ragas",
                "metrics_evaluated": ",".join(scores.keys()),
                "metric_count": str(len(scores)),
                "threshold": str(threshold),
                "scores": str(scores),
                "average_score": f"{overall_score:.2f}",
                "execution_time_seconds": str(execution_time)
            }

            # Add validation results to metadata (backward compatible - only additive)
            if validation_results:
                metadata.update({
                    "requested_metrics": ",".join(metrics),
                    "valid_metrics": ",".join(validation_results.get('valid_metrics', [])),
                    "invalid_metrics": ",".join(validation_results.get('invalid_metrics', [])),
                    "validation_summary": f"{len(validation_results.get('valid_metrics', []))} successful, {len(validation_results.get('invalid_metrics', []))} failed"
                })

                # Add specific validation errors if any (as JSON string for structured data)
                if validation_results.get('validation_errors'):
                    import json
                    metadata["validation_errors"] = json.dumps(validation_results['validation_errors'])

                # Add information about failed metrics (backward compatible)
                if validation_results.get('invalid_metrics'):
                    failed_metrics_info = {}
                    for metric in validation_results['invalid_metrics']:
                        error = validation_results['validation_errors'].get(metric, 'validation failed')
                        failed_metrics_info[metric] = error
                    metadata["failed_metrics"] = json.dumps(failed_metrics_info)

            # Add model info as strings
            for key, value in model_info.items():
                metadata[f"model_{key}"] = str(value)

            # Check for token usage if adapter supports it
            token_usage = TokenUsage()
            if hasattr(adapter, 'get_token_usage'):
                try:
                    adapter_usage = adapter.get_token_usage()
                    if adapter_usage and isinstance(adapter_usage, TokenUsage):
                        token_usage = adapter_usage
                except Exception as e:
                    logger.debug(f"Could not get token usage: {e}")

            return EvaluationResponse(
                score=str(overall_score),
                passed=overall_score >= threshold,
                metadata=metadata,
                tokenUsage=token_usage
            )

        except ImportError as e:
            logger.error(f"RAGAS library not available: {e}")
            return self._handle_import_error(
                "ragas",
                "pip install ragas datasets"
            )
        except Exception as e:
            logger.error(f"RAGAS evaluation failed: {e}")
            return EvaluationResponse(
                score="0.0",
                passed=False,
                error=f"RAGAS evaluation failed: {str(e)}",
                metadata={
                    "provider": "ragas",
                    "execution_time_seconds": str(time.time() - start_time)
                }
            )

    def _get_ragas_adapter(self):
        """Get or create RAGAS adapter instance."""
        if self._ragas_adapter is None:
            from .ragas_adapter_refactored import RagasAdapter
            self._ragas_adapter = RagasAdapter()
        return self._ragas_adapter

    def _parse_metrics(self, metrics_str: str) -> List[str]:
        """
        Parse metrics specification from string.

        Args:
            metrics_str: Comma-separated metrics string

        Returns:
            List of metric names
        """
        if not metrics_str:
            # Default metrics
            return ["relevance", "correctness"]

        # Split and clean metrics
        metrics = [metric.strip() for metric in metrics_str.split(",")]
        return [metric for metric in metrics if metric]  # Remove empty strings

    def _parse_connection_config(self, parameters: Dict[str, Any], prefix: str) -> Dict[str, Any]:
        """
        Parse connection configuration for the specified provider.

        Args:
            parameters: Full parameters dictionary
            prefix: Provider prefix ("azure" or "openai")

        Returns:
            Connection configuration dictionary
        """
        config = super()._parse_connection_config(parameters, prefix)

        # Handle provider-specific mappings
        if prefix == "azure":
            # Map Azure-specific fields
            extracted = self._extract_parameters_by_prefix(parameters, prefix)
            config.update({
                "api_key": extracted.get("api_key"),
                "base_url": extracted.get("endpoint"),
                "api_version": extracted.get("api_version"),
                "deployment_name": extracted.get("deployment_name"),
                "embedding_deployment": extracted.get("embedding_deployment")
            })
        elif prefix == "openai":
            # Map OpenAI-specific fields
            extracted = self._extract_parameters_by_prefix(parameters, prefix)
            config.update({
                "api_key": extracted.get("api_key"),
                "base_url": extracted.get("base_url"),
                "model": extracted.get("model", "gpt-4"),
                "embedding_model": extracted.get("embedding_model", "text-embedding-ada-002")
            })

        return config

    def _extract_model_info(self, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """
        Extract model information from parameters.

        Args:
            parameters: Request parameters

        Returns:
            Model information dictionary
        """
        model_info = {}

        # Check for Azure configuration
        if "azure.deployment_name" in parameters:
            model_info.update({
                "provider": "azure_openai",
                "model": parameters.get("azure.deployment_name"),
                "embedding_model": parameters.get("azure.embedding_deployment"),
                "api_version": parameters.get("azure.api_version")
            })
        # Check for OpenAI configuration
        elif "openai.model" in parameters:
            model_info.update({
                "provider": "openai",
                "model": parameters.get("openai.model"),
                "embedding_model": parameters.get("openai.embedding_model")
            })

        # Add common parameters
        if "temperature" in parameters:
            model_info["temperature"] = parameters["temperature"]
        if "max_tokens" in parameters:
            model_info["max_tokens"] = parameters["max_tokens"]

        return model_info