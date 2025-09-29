"""
Interface for OSS evaluation providers.
Separate from the ARK provider base to maintain clear boundaries.
"""

from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any, Callable, Awaitable
import logging
import asyncio
from datetime import datetime

from ..types import UnifiedEvaluationRequest, EvaluationResponse, TokenUsage

logger = logging.getLogger(__name__)


class OSSEvaluationProvider(ABC):
    """
    Abstract base class for OSS platform evaluation providers.
    This is separate from the ARK EvaluationProvider to maintain clear separation.

    Provides common utilities for:
    - Parameter validation and extraction
    - Session management
    - Error handling
    - Response building
    - Secure logging
    """

    def __init__(self, shared_session=None):
        self.shared_session = shared_session
        self._cleanup_functions = []

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

    def _extract_parameters_by_prefix(self, parameters: Dict[str, Any], prefix: str) -> Dict[str, Any]:
        """
        Extract parameters that start with a given prefix.

        Args:
            parameters: Full parameters dictionary
            prefix: Prefix to filter by (e.g., "langfuse", "ragas")

        Returns:
            Dictionary with prefix removed from keys
        """
        extracted = {}
        prefix_with_dot = f"{prefix}."

        for key, value in parameters.items():
            if key.startswith(prefix_with_dot):
                new_key = key[len(prefix_with_dot):]
                extracted[new_key] = value

        return extracted

    def _get_safe_params_for_logging(self, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a safe version of parameters for logging (masks sensitive data).

        Args:
            parameters: Original parameters

        Returns:
            Parameters with sensitive fields masked
        """
        sensitive_keywords = ["key", "secret", "token", "password", "credential"]
        safe_params = {}

        for key, value in parameters.items():
            if any(keyword in key.lower() for keyword in sensitive_keywords):
                safe_params[key] = "***"
            else:
                safe_params[key] = value

        return safe_params

    def _build_success_response(
        self,
        score: float,
        metadata: Optional[Dict[str, Any]] = None,
        token_usage: Optional[TokenUsage] = None,
        threshold: float = 0.7
    ) -> EvaluationResponse:
        """
        Build a successful evaluation response.

        Args:
            score: Evaluation score
            metadata: Additional metadata
            token_usage: Token usage information
            threshold: Passing threshold

        Returns:
            EvaluationResponse for success
        """
        return EvaluationResponse(
            score=str(score),
            passed=score >= threshold,
            metadata={
                "provider": self.get_evaluation_type(),
                "timestamp": datetime.utcnow().isoformat(),
                **(metadata or {})
            },
            tokenUsage=token_usage or TokenUsage()
        )

    def _build_error_response(
        self,
        error_message: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> EvaluationResponse:
        """
        Build an error evaluation response.

        Args:
            error_message: Error description
            metadata: Additional error metadata

        Returns:
            EvaluationResponse for error
        """
        return EvaluationResponse(
            score="0.0",
            passed=False,
            error=error_message,
            metadata={
                "provider": self.get_evaluation_type(),
                "timestamp": datetime.utcnow().isoformat(),
                "error_type": "evaluation_error",
                **(metadata or {})
            }
        )

    def _set_shared_session(self, session: Any) -> None:
        """Set the shared session for this provider."""
        self.shared_session = session

    def _get_session(self) -> Optional[Any]:
        """Get the current shared session."""
        return self.shared_session

    async def _safe_execute(
        self,
        func: Callable[[], Awaitable[Any]],
        error_message: str,
        default_return: Any = None
    ) -> Any:
        """
        Safely execute an async function with error handling.

        Args:
            func: Function to execute
            error_message: Error message if function fails
            default_return: Value to return on error

        Returns:
            Function result or default_return on error
        """
        try:
            return await func()
        except Exception as e:
            logger.error(f"{error_message}: {e}")
            return default_return

    def _parse_connection_config(
        self,
        parameters: Dict[str, Any],
        prefix: str,
        field_mapping: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """
        Parse connection configuration from parameters.

        Args:
            parameters: Full parameters dictionary
            prefix: Parameter prefix to extract
            field_mapping: Optional mapping of parameter names to config keys

        Returns:
            Connection configuration dictionary
        """
        extracted = self._extract_parameters_by_prefix(parameters, prefix)

        if field_mapping:
            config = {}
            for param_key, config_key in field_mapping.items():
                param_name = param_key.replace(f"{prefix}.", "")
                if param_name in extracted:
                    config[config_key] = extracted[param_name]
        else:
            # Default mapping
            config = {
                "base_url": extracted.get("host", extracted.get("url", extracted.get("endpoint"))),
                "api_key": extracted.get("api_key", extracted.get("key", extracted.get("token"))),
                **{k: v for k, v in extracted.items() if k not in ["host", "url", "endpoint", "api_key", "key", "token"]}
            }

        return config

    def _build_evaluation_metadata(
        self,
        base_metadata: Optional[Dict[str, Any]] = None,
        scores: Optional[Dict[str, float]] = None,
        execution_time: Optional[float] = None,
        model_info: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Build comprehensive evaluation metadata.

        Args:
            base_metadata: Base metadata to include
            scores: Individual metric scores
            execution_time: Execution time in seconds
            model_info: Model information

        Returns:
            Complete metadata dictionary
        """
        metadata = {
            "provider": self.get_evaluation_type(),
            "timestamp": datetime.utcnow().isoformat(),
            **(base_metadata or {})
        }

        if scores:
            metadata["scores"] = scores
            metadata["average_score"] = sum(scores.values()) / len(scores)
            metadata["score_count"] = len(scores)

        if execution_time is not None:
            metadata["execution_time_seconds"] = execution_time

        if model_info:
            metadata["model_info"] = model_info

        return metadata

    def _register_cleanup(self, cleanup_func: Callable[[], Awaitable[None]]) -> None:
        """
        Register a cleanup function to be called during provider cleanup.

        Args:
            cleanup_func: Async function to call during cleanup
        """
        self._cleanup_functions.append(cleanup_func)

    async def _cleanup(self) -> None:
        """Execute all registered cleanup functions."""
        for cleanup_func in self._cleanup_functions:
            try:
                await cleanup_func()
            except Exception as e:
                logger.error(f"Error during cleanup: {e}")

    def _handle_import_error(self, library_name: str, install_command: str) -> EvaluationResponse:
        """
        Handle import errors for missing libraries.

        Args:
            library_name: Name of the missing library
            install_command: Command to install the library

        Returns:
            Error response with installation instructions
        """
        error_message = (
            f"{library_name} library is not installed. "
            f"Please install it with: {install_command}"
        )

        return self._build_error_response(
            error_message=error_message,
            metadata={
                "error_type": "import_error",
                "missing_library": library_name,
                "install_command": install_command
            }
        )

    def _handle_configuration_error(
        self,
        error_message: str,
        details: Optional[Dict[str, Any]] = None
    ) -> EvaluationResponse:
        """
        Handle configuration errors.

        Args:
            error_message: Configuration error description
            details: Additional error details

        Returns:
            Error response for configuration issues
        """
        return self._build_error_response(
            error_message=error_message,
            metadata={
                "error_type": "configuration_error",
                **(details or {})
            }
        )