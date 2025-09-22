"""
Tests for enhanced OSSEvaluationProvider base class.
Testing common functionality and utilities that can be shared across providers.
"""

import pytest
from unittest.mock import Mock, AsyncMock, patch
import sys
from pathlib import Path
from typing import Dict, Any

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "src"))


class TestOSSEvaluationProviderBase:
    """Test suite for enhanced OSSEvaluationProvider base class utilities."""

    @pytest.fixture
    def sample_params(self) -> Dict[str, Any]:
        """Sample parameters for testing."""
        return {
            "provider.host": "https://api.example.com",
            "provider.api_key": "test-api-key",
            "provider.secret": "test-secret",
            "temperature": 0.1,
            "max_tokens": 1000
        }

    def test_parameter_extraction_by_prefix(self, sample_params):
        """Test extracting parameters by prefix."""
        from evaluator.core.interface import OSSEvaluationProvider

        # Create a concrete implementation for testing
        class TestProvider(OSSEvaluationProvider):
            async def evaluate(self, request):
                pass

            def get_evaluation_type(self):
                return "test"

            def get_required_parameters(self):
                return ["provider.host", "provider.api_key"]

        provider = TestProvider()

        # Test extracting by prefix
        provider_params = provider._extract_parameters_by_prefix(sample_params, "provider")

        assert "host" in provider_params
        assert "api_key" in provider_params
        assert "secret" in provider_params
        assert provider_params["host"] == "https://api.example.com"
        assert provider_params["api_key"] == "test-api-key"

        # Should not include non-matching parameters
        assert "temperature" not in provider_params
        assert "max_tokens" not in provider_params

    def test_secure_parameter_logging(self, sample_params):
        """Test that sensitive parameters are masked in logs."""
        from evaluator.core.interface import OSSEvaluationProvider

        class TestProvider(OSSEvaluationProvider):
            async def evaluate(self, request):
                pass

            def get_evaluation_type(self):
                return "test"

            def get_required_parameters(self):
                return ["provider.api_key"]

        provider = TestProvider()

        # Test secure logging
        safe_params = provider._get_safe_params_for_logging(sample_params)

        # Sensitive fields should be masked
        assert "provider.api_key" in safe_params
        assert safe_params["provider.api_key"] == "***"
        assert "provider.secret" in safe_params
        assert safe_params["provider.secret"] == "***"

        # Non-sensitive fields should remain
        assert safe_params["provider.host"] == "https://api.example.com"
        assert safe_params["temperature"] == 0.1

    def test_response_builder_utilities(self):
        """Test response building utilities."""
        from evaluator.core.interface import OSSEvaluationProvider
        from evaluator.types import EvaluationResponse, TokenUsage

        class TestProvider(OSSEvaluationProvider):
            async def evaluate(self, request):
                pass

            def get_evaluation_type(self):
                return "test"

            def get_required_parameters(self):
                return []

        provider = TestProvider()

        # Test successful response
        response = provider._build_success_response(
            score=0.85,
            metadata={"test": "value"},
            token_usage=TokenUsage(promptTokens=10, completionTokens=20, totalTokens=30)
        )

        assert isinstance(response, EvaluationResponse)
        assert response.score == "0.85"
        assert response.passed is True  # Default threshold 0.7
        assert response.metadata["test"] == "value"
        assert response.tokenUsage.promptTokens == 10

        # Test failure response
        error_response = provider._build_error_response(
            error_message="Test error",
            metadata={"error_code": "TEST_001"}
        )

        assert isinstance(error_response, EvaluationResponse)
        assert error_response.score == "0.0"
        assert error_response.passed is False
        assert error_response.error == "Test error"
        assert error_response.metadata["error_code"] == "TEST_001"

    def test_session_management_utilities(self):
        """Test session lifecycle management."""
        from evaluator.core.interface import OSSEvaluationProvider

        class TestProvider(OSSEvaluationProvider):
            async def evaluate(self, request):
                pass

            def get_evaluation_type(self):
                return "test"

            def get_required_parameters(self):
                return []

        provider = TestProvider()

        # Test session initialization
        mock_session = Mock()
        provider._set_shared_session(mock_session)
        assert provider.shared_session == mock_session

        # Test session retrieval
        retrieved_session = provider._get_session()
        assert retrieved_session == mock_session

        # Test when no session is set
        provider.shared_session = None
        assert provider._get_session() is None

    @pytest.mark.asyncio
    async def test_error_handling_decorators(self):
        """Test error handling decorators and utilities."""
        from evaluator.core.interface import OSSEvaluationProvider

        class TestProvider(OSSEvaluationProvider):
            async def evaluate(self, request):
                pass

            def get_evaluation_type(self):
                return "test"

            def get_required_parameters(self):
                return []

        provider = TestProvider()

        # Test error handling wrapper
        async def failing_function():
            raise ValueError("Test error")

        async def successful_function():
            return {"result": "success"}

        # Test successful execution
        result = await provider._safe_execute(
            successful_function,
            error_message="Function failed"
        )
        assert result["result"] == "success"

        # Test error handling
        result = await provider._safe_execute(
            failing_function,
            error_message="Function failed",
            default_return={"error": True}
        )
        assert result["error"] is True

    def test_validation_helpers(self, sample_params):
        """Test parameter validation helpers."""
        from evaluator.core.interface import OSSEvaluationProvider

        class TestProvider(OSSEvaluationProvider):
            async def evaluate(self, request):
                pass

            def get_evaluation_type(self):
                return "test"

            def get_required_parameters(self):
                return ["provider.host", "provider.api_key"]

        provider = TestProvider()

        # Test successful validation
        assert provider.validate_parameters(sample_params) is True

        # Test missing parameters
        incomplete_params = {"provider.host": "test"}
        assert provider.validate_parameters(incomplete_params) is False

        # Test empty parameters
        assert provider.validate_parameters({}) is False
        assert provider.validate_parameters(None) is False

    def test_configuration_parsing(self, sample_params):
        """Test configuration parsing utilities."""
        from evaluator.core.interface import OSSEvaluationProvider

        class TestProvider(OSSEvaluationProvider):
            async def evaluate(self, request):
                pass

            def get_evaluation_type(self):
                return "test"

            def get_required_parameters(self):
                return []

        provider = TestProvider()

        # Test URL parsing
        config = provider._parse_connection_config(sample_params, "provider")
        assert config["base_url"] == "https://api.example.com"
        assert config["api_key"] == "test-api-key"
        assert "secret" in config

        # Test with custom mappings
        custom_mapping = {
            "provider.host": "endpoint",
            "provider.api_key": "token"
        }

        config = provider._parse_connection_config(
            sample_params,
            "provider",
            field_mapping=custom_mapping
        )
        assert config["endpoint"] == "https://api.example.com"
        assert config["token"] == "test-api-key"

    def test_metadata_utilities(self):
        """Test metadata building and management utilities."""
        from evaluator.core.interface import OSSEvaluationProvider

        class TestProvider(OSSEvaluationProvider):
            async def evaluate(self, request):
                pass

            def get_evaluation_type(self):
                return "test"

            def get_required_parameters(self):
                return []

        provider = TestProvider()

        # Test metadata building
        base_metadata = {"provider": "test", "version": "1.0"}
        scores = {"accuracy": 0.85, "relevance": 0.90}

        metadata = provider._build_evaluation_metadata(
            base_metadata=base_metadata,
            scores=scores,
            execution_time=1.5,
            model_info={"name": "gpt-4", "temperature": 0.1}
        )

        assert metadata["provider"] == "test"
        assert metadata["scores"]["accuracy"] == 0.85
        assert metadata["average_score"] == 0.875
        assert metadata["execution_time_seconds"] == 1.5
        assert metadata["model_info"]["name"] == "gpt-4"

    @pytest.mark.asyncio
    async def test_async_context_management(self):
        """Test async context management utilities."""
        from evaluator.core.interface import OSSEvaluationProvider

        class TestProvider(OSSEvaluationProvider):
            async def evaluate(self, request):
                pass

            def get_evaluation_type(self):
                return "test"

            def get_required_parameters(self):
                return []

        provider = TestProvider()

        # Test async cleanup
        cleanup_called = False

        async def cleanup_function():
            nonlocal cleanup_called
            cleanup_called = True

        provider._register_cleanup(cleanup_function)
        await provider._cleanup()

        assert cleanup_called is True

    def test_common_error_handling_patterns(self):
        """Test common error handling patterns and utilities."""
        from evaluator.core.interface import OSSEvaluationProvider

        class TestProvider(OSSEvaluationProvider):
            async def evaluate(self, request):
                pass

            def get_evaluation_type(self):
                return "test"

            def get_required_parameters(self):
                return []

        provider = TestProvider()

        # Test import error handling
        error_response = provider._handle_import_error(
            "test_library",
            "pip install test-library"
        )

        assert "test_library" in error_response.error
        assert "pip install test-library" in error_response.error
        assert error_response.passed is False

        # Test configuration error handling
        config_error = provider._handle_configuration_error(
            "Missing API key",
            {"required": "api_key", "provided": "host"}
        )

        assert "Missing API key" in config_error.error
        assert config_error.metadata["required"] == "api_key"
        assert config_error.passed is False