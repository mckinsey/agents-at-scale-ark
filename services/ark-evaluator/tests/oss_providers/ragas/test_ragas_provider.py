"""
Tests for RagasProvider - standalone RAGAS evaluation provider.
Following TDD approach - these tests are written before implementation.

This provider focuses purely on RAGAS evaluation without Langfuse dependencies.
"""

import pytest
from unittest.mock import Mock, AsyncMock, patch, MagicMock
import sys
from pathlib import Path
from typing import Dict, Any

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "src"))


class TestRagasProvider:
    """Test suite for standalone RagasProvider."""

    @pytest.fixture
    def sample_azure_params(self) -> Dict[str, Any]:
        """Sample Azure OpenAI parameters for RAGAS."""
        return {
            "azure.api_key": "test-azure-key",
            "azure.endpoint": "https://test.openai.azure.com/",
            "azure.api_version": "2024-02-01",
            "azure.deployment_name": "gpt-4",
            "azure.embedding_deployment": "text-embedding-ada-002",
            "metrics": "relevance,correctness,faithfulness",
            "temperature": "0.1"
        }

    @pytest.fixture
    def sample_openai_params(self) -> Dict[str, Any]:
        """Sample OpenAI parameters for RAGAS."""
        return {
            "openai.api_key": "test-openai-key",
            "openai.base_url": "https://api.openai.com/v1",
            "openai.model": "gpt-4",
            "openai.embedding_model": "text-embedding-ada-002",
            "metrics": "relevance,correctness",
            "temperature": "0.0"
        }

    @pytest.fixture
    def sample_evaluation_request(self):
        """Sample evaluation request for testing."""
        from evaluator.types import UnifiedEvaluationRequest, EvaluationType, EvaluationConfig

        return UnifiedEvaluationRequest(
            type=EvaluationType.DIRECT,
            config=EvaluationConfig(
                input="What is the capital of France?",
                output="The capital of France is Paris.",
                context="France is a country in Europe."
            ),
            parameters={
                "azure.api_key": "test-key",
                "azure.endpoint": "https://test.openai.azure.com/",
                "azure.api_version": "2024-02-01",
                "metrics": "relevance,correctness"
            }
        )

    def test_provider_initialization(self):
        """Test RagasProvider can be initialized properly."""
        from evaluator.oss_providers.ragas.ragas_provider import RagasProvider

        # Test default initialization
        provider = RagasProvider()
        assert provider is not None
        assert provider.get_evaluation_type() == "ragas"

        # Test with shared session
        mock_session = Mock()
        provider_with_session = RagasProvider(shared_session=mock_session)
        assert provider_with_session.shared_session == mock_session

    def test_get_evaluation_type(self):
        """Test provider returns correct evaluation type."""
        from evaluator.oss_providers.ragas.ragas_provider import RagasProvider

        provider = RagasProvider()
        assert provider.get_evaluation_type() == "ragas"

    def test_get_required_parameters_azure(self):
        """Test required parameters for Azure OpenAI configuration."""
        from evaluator.oss_providers.ragas.ragas_provider import RagasProvider

        provider = RagasProvider()
        required = provider.get_required_parameters()

        # Should include Azure-specific parameters
        assert "azure.api_key" in required or "openai.api_key" in required
        assert "azure.endpoint" in required or "openai.base_url" in required

    def test_parameter_validation_azure(self, sample_azure_params):
        """Test parameter validation for Azure configuration."""
        from evaluator.oss_providers.ragas.ragas_provider import RagasProvider

        provider = RagasProvider()

        # Test valid Azure parameters
        assert provider.validate_parameters(sample_azure_params) is True

        # Test missing required parameters
        incomplete_params = {"azure.api_key": "test"}
        assert provider.validate_parameters(incomplete_params) is False

        # Test empty parameters
        assert provider.validate_parameters({}) is False
        assert provider.validate_parameters(None) is False

    def test_parameter_validation_openai(self, sample_openai_params):
        """Test parameter validation for OpenAI configuration."""
        from evaluator.oss_providers.ragas.ragas_provider import RagasProvider

        provider = RagasProvider()

        # Test valid OpenAI parameters
        assert provider.validate_parameters(sample_openai_params) is True

    @pytest.mark.asyncio
    async def test_evaluation_with_azure_openai(self, sample_evaluation_request):
        """Test evaluation using Azure OpenAI configuration."""
        from evaluator.oss_providers.ragas.ragas_provider import RagasProvider

        provider = RagasProvider()

        # Mock RAGAS adapter
        mock_scores = {"relevance": 0.85, "correctness": 0.92}

        with patch.object(provider, '_get_ragas_adapter') as mock_get_adapter:
            mock_adapter = AsyncMock()
            mock_adapter.evaluate = AsyncMock(return_value=mock_scores)
            mock_adapter.get_validation_results = Mock(return_value={
                'valid_metrics': ['relevance', 'correctness'],
                'invalid_metrics': [],
                'validation_errors': {}
            })
            mock_get_adapter.return_value = mock_adapter

            response = await provider.evaluate(sample_evaluation_request)

            # Verify response structure
            assert response.score is not None
            assert response.passed is not None
            assert response.metadata["provider"] == "ragas"
            assert "scores" in response.metadata
            assert response.metadata["scores"] == str(mock_scores)

            # Verify adapter was called correctly
            mock_adapter.evaluate.assert_called_once()
            call_args = mock_adapter.evaluate.call_args[0]
            assert "What is the capital of France?" in call_args[0]  # input
            assert "The capital of France is Paris." in call_args[1]  # output

    @pytest.mark.asyncio
    async def test_evaluation_with_openai(self, sample_openai_params):
        """Test evaluation using OpenAI configuration."""
        from evaluator.oss_providers.ragas.ragas_provider import RagasProvider
        from evaluator.types import UnifiedEvaluationRequest, EvaluationType, EvaluationConfig

        provider = RagasProvider()

        request = UnifiedEvaluationRequest(
            type=EvaluationType.DIRECT,
            config=EvaluationConfig(
                input="Explain machine learning",
                output="Machine learning is a subset of AI that uses algorithms to learn patterns from data."
            ),
            parameters=sample_openai_params
        )

        mock_scores = {"relevance": 0.78, "correctness": 0.88}

        with patch.object(provider, '_get_ragas_adapter') as mock_get_adapter:
            mock_adapter = AsyncMock()
            mock_adapter.evaluate = AsyncMock(return_value=mock_scores)
            mock_adapter.get_validation_results = Mock(return_value={
                'valid_metrics': ['relevance', 'correctness'],
                'invalid_metrics': [],
                'validation_errors': {}
            })
            mock_get_adapter.return_value = mock_adapter

            response = await provider.evaluate(request)

            assert response.passed is True  # Above default threshold
            assert response.metadata["provider"] == "ragas"
            assert response.metadata["average_score"] == "0.83"

    @pytest.mark.asyncio
    async def test_evaluation_with_context(self):
        """Test evaluation with context information."""
        from evaluator.oss_providers.ragas.ragas_provider import RagasProvider
        from evaluator.types import UnifiedEvaluationRequest, EvaluationType, EvaluationConfig

        provider = RagasProvider()

        request = UnifiedEvaluationRequest(
            type=EvaluationType.DIRECT,
            config=EvaluationConfig(
                input="What is the population of Tokyo?",
                output="Tokyo has approximately 14 million people.",
                context="Tokyo is the capital city of Japan and one of the most populous metropolitan areas in the world."
            ),
            parameters={
                "azure.api_key": "test",
                "azure.endpoint": "https://test.azure.com",
                "azure.api_version": "2024-02-01",
                "metrics": "relevance,correctness,faithfulness"
            }
        )

        mock_scores = {"relevance": 0.90, "correctness": 0.85, "faithfulness": 0.88}

        with patch.object(provider, '_get_ragas_adapter') as mock_get_adapter:
            mock_adapter = AsyncMock()
            mock_adapter.evaluate = AsyncMock(return_value=mock_scores)
            mock_adapter.get_validation_results = Mock(return_value={
                'valid_metrics': ['relevance', 'correctness'],
                'invalid_metrics': [],
                'validation_errors': {}
            })
            mock_get_adapter.return_value = mock_adapter

            response = await provider.evaluate(request)

            # Verify context was included in the evaluation
            call_args = mock_adapter.evaluate.call_args[0]
            assert len(call_args) >= 3  # input, output, metrics
            assert "faithfulness" in call_args[2]  # metrics should include context-based metrics

    @pytest.mark.asyncio
    async def test_missing_ragas_library_handling(self, sample_evaluation_request):
        """Test graceful handling when RAGAS library is not installed."""
        from evaluator.oss_providers.ragas.ragas_provider import RagasProvider

        provider = RagasProvider()

        # Mock import error
        with patch.object(provider, '_get_ragas_adapter') as mock_get_adapter:
            mock_get_adapter.side_effect = ImportError("No module named 'ragas'")

            response = await provider.evaluate(sample_evaluation_request)

            assert response.passed is False
            assert response.error is not None
            assert "ragas" in response.error.lower()
            assert "pip install" in response.error

    @pytest.mark.asyncio
    async def test_configuration_error_handling(self):
        """Test handling of configuration errors."""
        from evaluator.oss_providers.ragas.ragas_provider import RagasProvider
        from evaluator.types import UnifiedEvaluationRequest, EvaluationType, EvaluationConfig

        provider = RagasProvider()

        # Request with invalid configuration
        request = UnifiedEvaluationRequest(
            type=EvaluationType.DIRECT,
            config=EvaluationConfig(
                input="Test input",
                output="Test output"
            ),
            parameters={}  # Empty parameters
        )

        response = await provider.evaluate(request)

        assert response.passed is False
        assert response.error is not None
        assert "configuration" in response.error.lower() or "parameter" in response.error.lower()

    @pytest.mark.asyncio
    async def test_evaluation_failure_handling(self, sample_evaluation_request):
        """Test handling when RAGAS evaluation fails."""
        from evaluator.oss_providers.ragas.ragas_provider import RagasProvider

        provider = RagasProvider()

        # Mock adapter that raises an exception
        with patch.object(provider, '_get_ragas_adapter') as mock_get_adapter:
            mock_adapter = AsyncMock()
            mock_adapter.evaluate = AsyncMock(side_effect=Exception("RAGAS evaluation failed"))
            mock_get_adapter.return_value = mock_adapter

            response = await provider.evaluate(sample_evaluation_request)

            assert response.passed is False
            assert response.error is not None
            assert "RAGAS evaluation failed" in response.error

    def test_metric_parsing(self):
        """Test parsing of metric specifications."""
        from evaluator.oss_providers.ragas.ragas_provider import RagasProvider

        provider = RagasProvider()

        # Test comma-separated metrics
        metrics = provider._parse_metrics("relevance,correctness,faithfulness")
        assert metrics == ["relevance", "correctness", "faithfulness"]

        # Test single metric
        metrics = provider._parse_metrics("relevance")
        assert metrics == ["relevance"]

        # Test metrics with spaces
        metrics = provider._parse_metrics("relevance, correctness, faithfulness")
        assert metrics == ["relevance", "correctness", "faithfulness"]

        # Test default metrics
        metrics = provider._parse_metrics("")
        assert len(metrics) > 0  # Should have defaults

    def test_connection_config_parsing_azure(self, sample_azure_params):
        """Test parsing Azure connection configuration."""
        from evaluator.oss_providers.ragas.ragas_provider import RagasProvider

        provider = RagasProvider()

        config = provider._parse_connection_config(sample_azure_params, "azure")

        assert config["api_key"] == "test-azure-key"
        assert config["base_url"] == "https://test.openai.azure.com/"
        assert config["api_version"] == "2024-02-01"

    def test_connection_config_parsing_openai(self, sample_openai_params):
        """Test parsing OpenAI connection configuration."""
        from evaluator.oss_providers.ragas.ragas_provider import RagasProvider

        provider = RagasProvider()

        config = provider._parse_connection_config(sample_openai_params, "openai")

        assert config["api_key"] == "test-openai-key"
        assert config["base_url"] == "https://api.openai.com/v1"

    @pytest.mark.asyncio
    async def test_score_aggregation_and_thresholding(self, sample_evaluation_request):
        """Test score aggregation and pass/fail thresholding."""
        from evaluator.oss_providers.ragas.ragas_provider import RagasProvider

        provider = RagasProvider()

        # Test scores above threshold
        mock_scores_high = {"relevance": 0.85, "correctness": 0.90}

        with patch.object(provider, '_get_ragas_adapter') as mock_get_adapter:
            mock_adapter = AsyncMock()
            mock_adapter.evaluate = AsyncMock(return_value=mock_scores_high)
            mock_adapter.get_validation_results = Mock(return_value={
                'valid_metrics': ['relevance', 'correctness'],
                'invalid_metrics': [],
                'validation_errors': {}
            })
            mock_get_adapter.return_value = mock_adapter

            response = await provider.evaluate(sample_evaluation_request)

            assert response.passed is True
            assert float(response.score) == 0.875  # Average of 0.85 and 0.90

        # Test scores below threshold
        mock_scores_low = {"relevance": 0.40, "correctness": 0.50}

        with patch.object(provider, '_get_ragas_adapter') as mock_get_adapter:
            mock_adapter = AsyncMock()
            mock_adapter.evaluate = AsyncMock(return_value=mock_scores_low)
            mock_adapter.get_validation_results = Mock(return_value={
                'valid_metrics': ['relevance', 'correctness'],
                'invalid_metrics': [],
                'validation_errors': {}
            })
            mock_get_adapter.return_value = mock_adapter

            response = await provider.evaluate(sample_evaluation_request)

            assert response.passed is False
            assert float(response.score) == 0.45  # Average of 0.40 and 0.50

    @pytest.mark.asyncio
    async def test_token_usage_tracking(self, sample_evaluation_request):
        """Test that token usage is properly tracked and returned."""
        from evaluator.oss_providers.ragas.ragas_provider import RagasProvider
        from evaluator.types import TokenUsage

        provider = RagasProvider()

        mock_scores = {"relevance": 0.85}
        mock_token_usage = TokenUsage(promptTokens=100, completionTokens=50, totalTokens=150)

        with patch.object(provider, '_get_ragas_adapter') as mock_get_adapter:
            mock_adapter = AsyncMock()
            mock_adapter.evaluate = AsyncMock(return_value=mock_scores)
            mock_adapter.get_token_usage = Mock(return_value=mock_token_usage)
            mock_adapter.get_validation_results = Mock(return_value={
                'valid_metrics': ['relevance'],
                'invalid_metrics': [],
                'validation_errors': {}
            })
            mock_get_adapter.return_value = mock_adapter

            response = await provider.evaluate(sample_evaluation_request)

            # Check if token usage is included (if adapter supports it)
            if hasattr(response, 'tokenUsage') and response.tokenUsage:
                assert response.tokenUsage.totalTokens == 150

    @pytest.mark.asyncio
    async def test_custom_threshold_parameter(self):
        """Test using custom threshold parameter."""
        from evaluator.oss_providers.ragas.ragas_provider import RagasProvider
        from evaluator.types import UnifiedEvaluationRequest, EvaluationType, EvaluationConfig

        provider = RagasProvider()

        request = UnifiedEvaluationRequest(
            type=EvaluationType.DIRECT,
            config=EvaluationConfig(
                input="Test input",
                output="Test output"
            ),
            parameters={
                "azure.api_key": "test",
                "azure.endpoint": "https://test.azure.com",
                "azure.api_version": "2024-02-01",
                "threshold": "0.9"  # Custom high threshold
            }
        )

        mock_scores = {"relevance": 0.85}  # Below custom threshold

        with patch.object(provider, '_get_ragas_adapter') as mock_get_adapter:
            mock_adapter = AsyncMock()
            mock_adapter.evaluate = AsyncMock(return_value=mock_scores)
            mock_adapter.get_validation_results = Mock(return_value={
                'valid_metrics': ['relevance', 'correctness'],
                'invalid_metrics': [],
                'validation_errors': {}
            })
            mock_get_adapter.return_value = mock_adapter

            response = await provider.evaluate(request)

            # Should fail with high threshold
            assert response.passed is False
            assert float(response.score) == 0.85