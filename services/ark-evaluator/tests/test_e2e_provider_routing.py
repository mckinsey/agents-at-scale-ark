"""
End-to-end tests for provider routing through EvaluationManager.
Tests the complete flow from request creation to evaluation response.
"""

import pytest
from unittest.mock import Mock, AsyncMock, patch
import sys
from pathlib import Path
from typing import Dict, Any

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))


class TestEndToEndProviderRouting:
    """End-to-end tests for evaluation provider routing."""

    @pytest.fixture
    def sample_ragas_request(self):
        """Sample request for RAGAS evaluation."""
        from evaluator.types import UnifiedEvaluationRequest, EvaluationType, EvaluationConfig

        return UnifiedEvaluationRequest(
            type=EvaluationType.DIRECT,
            config=EvaluationConfig(
                input="What is the capital of France?",
                output="The capital of France is Paris.",
                context="France is a country in Western Europe."
            ),
            parameters={
                "provider": "ragas",
                "azure.api_key": "test-key",
                "azure.endpoint": "https://test.openai.azure.com/",
                "azure.api_version": "2024-02-01",
                "azure.deployment_name": "gpt-4",
                "metrics": "relevance,correctness",
                "threshold": "0.8"
            }
        )

    @pytest.fixture
    def sample_langfuse_request(self):
        """Sample request for Langfuse evaluation."""
        from evaluator.types import UnifiedEvaluationRequest, EvaluationType, EvaluationConfig

        return UnifiedEvaluationRequest(
            type=EvaluationType.DIRECT,
            config=EvaluationConfig(
                input="Explain machine learning",
                output="Machine learning is a subset of AI that uses algorithms to learn patterns from data."
            ),
            parameters={
                "provider": "langfuse",
                "langfuse.host": "https://cloud.langfuse.com",
                "langfuse.public_key": "test-public",
                "langfuse.secret_key": "test-secret",
                "metrics": "relevance,correctness"
            }
        )

    def test_evaluation_manager_initialization(self):
        """Test that EvaluationManager correctly initializes both providers."""
        from evaluator.core.manager import EvaluationManager

        manager = EvaluationManager()

        # Check providers are registered
        providers = manager.list_oss_providers()
        assert "ragas" in providers
        assert "langfuse" in providers

        # Check we can get both providers
        ragas_provider = manager.get_oss_provider("ragas")
        langfuse_provider = manager.get_oss_provider("langfuse")

        assert ragas_provider is not None
        assert langfuse_provider is not None
        assert ragas_provider.get_evaluation_type() == "ragas"
        assert langfuse_provider.get_evaluation_type() == "langfuse"

    @pytest.mark.asyncio
    async def test_ragas_provider_routing(self, sample_ragas_request):
        """Test end-to-end evaluation routing to RagasProvider."""
        from evaluator.core.manager import EvaluationManager

        manager = EvaluationManager()

        # Mock the RAGAS adapter to avoid external dependencies
        with patch('evaluator.oss_providers.ragas_provider.RagasProvider._get_ragas_adapter') as mock_adapter_getter:
            mock_adapter = AsyncMock()
            mock_adapter.evaluate = AsyncMock(return_value={"relevance": 0.85, "correctness": 0.90})
            mock_adapter_getter.return_value = mock_adapter

            # Execute evaluation
            response = await manager.evaluate(sample_ragas_request)

            # Verify response
            assert response.score is not None
            assert response.passed is True  # 0.875 > 0.8 threshold
            assert response.metadata["provider"] == "ragas"
            assert "scores" in response.metadata

            # Verify adapter was called with correct parameters
            mock_adapter.evaluate.assert_called_once()
            call_args = mock_adapter.evaluate.call_args[0]
            assert "What is the capital of France?" in call_args[0]  # input
            assert "The capital of France is Paris." in call_args[1]  # output

    @pytest.mark.asyncio
    async def test_langfuse_provider_routing(self, sample_langfuse_request):
        """Test end-to-end evaluation routing to LangfuseProvider."""
        from evaluator.core.manager import EvaluationManager

        manager = EvaluationManager()

        # Mock Langfuse dependencies (lazy import inside evaluate method)
        with patch('langfuse.Langfuse') as mock_langfuse_class:
            mock_client = Mock()
            mock_trace = Mock()
            mock_trace.id = "test-trace-123"
            mock_generation = Mock()

            mock_client.trace.return_value = mock_trace
            mock_trace.generation.return_value = mock_generation
            mock_client.flush.return_value = None
            mock_langfuse_class.return_value = mock_client

            # Mock RAGAS evaluation (since Langfuse uses hybrid approach)
            with patch('evaluator.oss_providers.ragas_adapter.RagasAdapter') as mock_ragas_class:
                mock_ragas = AsyncMock()
                mock_ragas.evaluate = AsyncMock(return_value={"relevance": 0.75, "correctness": 0.80})
                mock_ragas_class.return_value = mock_ragas

                # Mock LangfuseTraceAdapter
                with patch('evaluator.oss_providers.langfuse_trace_adapter.LangfuseTraceAdapter') as mock_trace_adapter_class:
                    mock_trace_adapter = AsyncMock()
                    mock_trace_adapter.record_scores_to_trace = AsyncMock()
                    mock_trace_adapter_class.return_value = mock_trace_adapter

                    # Execute evaluation
                    response = await manager.evaluate(sample_langfuse_request)

                    # Verify response
                    assert response.score is not None
                    assert response.passed is True  # 0.775 > 0.7 default threshold
                    assert response.metadata["provider"] == "langfuse"
                    assert "trace_id" in response.metadata

    @pytest.mark.asyncio
    async def test_provider_parameter_validation(self, sample_ragas_request):
        """Test that provider parameter validation works correctly."""
        from evaluator.core.manager import EvaluationManager

        manager = EvaluationManager()

        # Test with missing required parameters
        invalid_request = sample_ragas_request.model_copy()
        invalid_request.parameters = {"provider": "ragas"}  # Missing required Azure params

        # Should get validation error from EvaluationManager
        with pytest.raises(ValueError) as exc_info:
            await manager.evaluate(invalid_request)

        assert "Missing required parameters for ragas provider" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_unknown_provider_handling(self, sample_ragas_request):
        """Test handling of unknown provider names."""
        from evaluator.core.manager import EvaluationManager

        manager = EvaluationManager()

        # Test with unknown provider
        invalid_request = sample_ragas_request.model_copy()
        invalid_request.parameters["provider"] = "unknown_provider"

        with pytest.raises(ValueError) as exc_info:
            await manager.evaluate(invalid_request)

        assert "Unknown provider: unknown_provider" in str(exc_info.value)
        assert "Available:" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_default_provider_fallback(self):
        """Test fallback to ARK provider when no provider specified."""
        from evaluator.core.manager import EvaluationManager
        from evaluator.types import UnifiedEvaluationRequest, EvaluationType, EvaluationConfig

        manager = EvaluationManager()

        # Request without provider parameter (should default to ARK)
        request = UnifiedEvaluationRequest(
            type=EvaluationType.DIRECT,
            config=EvaluationConfig(
                input="Test input",
                output="Test output"
            ),
            parameters={}  # No provider specified
        )

        # Mock ARK factory to avoid external dependencies
        with patch.object(manager.ark_factory, 'create') as mock_create:
            mock_ark_provider = AsyncMock()
            mock_ark_provider.evaluate = AsyncMock(return_value=Mock(
                score="0.8",
                passed=True,
                metadata={"provider": "ark"}
            ))
            mock_create.return_value = mock_ark_provider

            response = await manager.evaluate(request)

            # Verify ARK provider was used
            mock_create.assert_called_once_with(EvaluationType.DIRECT, shared_session=None)
            mock_ark_provider.evaluate.assert_called_once_with(request)

    def test_provider_listing(self):
        """Test listing available providers."""
        from evaluator.core.manager import EvaluationManager

        manager = EvaluationManager()

        # Test OSS provider listing
        oss_providers = manager.list_oss_providers()
        assert isinstance(oss_providers, list)
        assert "ragas" in oss_providers
        assert "langfuse" in oss_providers

        # Test ARK provider listing (if available)
        try:
            ark_types = manager.list_ark_types()
            assert isinstance(ark_types, list)
        except Exception:
            # ARK types may not be available in test environment
            pass

    @pytest.mark.asyncio
    async def test_concurrent_evaluations(self, sample_ragas_request, sample_langfuse_request):
        """Test concurrent evaluations with different providers."""
        import asyncio
        from evaluator.core.manager import EvaluationManager

        manager = EvaluationManager()

        # Mock both providers
        with patch('evaluator.oss_providers.ragas_provider.RagasProvider._get_ragas_adapter') as mock_ragas_adapter:
            mock_ragas = AsyncMock()
            mock_ragas.evaluate = AsyncMock(return_value={"relevance": 0.85})
            mock_ragas_adapter.return_value = mock_ragas

            with patch('langfuse.Langfuse') as mock_langfuse_class:
                mock_client = Mock()
                mock_trace = Mock()
                mock_trace.id = "test-trace"
                mock_client.trace.return_value = mock_trace
                mock_client.flush.return_value = None
                mock_langfuse_class.return_value = mock_client

                with patch('evaluator.oss_providers.ragas_adapter.RagasAdapter') as mock_ragas_class:
                    mock_ragas_for_langfuse = AsyncMock()
                    mock_ragas_for_langfuse.evaluate = AsyncMock(return_value={"relevance": 0.75})
                    mock_ragas_class.return_value = mock_ragas_for_langfuse

                    with patch('evaluator.oss_providers.langfuse_trace_adapter.LangfuseTraceAdapter'):
                        # Run concurrent evaluations
                        tasks = [
                            manager.evaluate(sample_ragas_request),
                            manager.evaluate(sample_langfuse_request)
                        ]

                        responses = await asyncio.gather(*tasks)

                        # Verify both completed successfully
                        assert len(responses) == 2
                        assert responses[0].metadata["provider"] == "ragas"
                        assert responses[1].metadata["provider"] == "langfuse"

    @pytest.mark.asyncio
    async def test_performance_benchmark(self, sample_ragas_request):
        """Basic performance test for evaluation."""
        import time
        from evaluator.core.manager import EvaluationManager

        manager = EvaluationManager()

        with patch('evaluator.oss_providers.ragas_provider.RagasProvider._get_ragas_adapter') as mock_adapter_getter:
            mock_adapter = AsyncMock()
            mock_adapter.evaluate = AsyncMock(return_value={"relevance": 0.85})
            mock_adapter_getter.return_value = mock_adapter

            # Measure evaluation time
            start_time = time.time()
            response = await manager.evaluate(sample_ragas_request)
            end_time = time.time()

            evaluation_time = end_time - start_time

            # Verify reasonable performance (should complete in under 1 second with mocking)
            assert evaluation_time < 1.0
            assert response.passed is True

            # Check if execution time is recorded in metadata
            if "execution_time_seconds" in response.metadata:
                recorded_time = float(response.metadata["execution_time_seconds"])
                assert recorded_time > 0
                assert recorded_time < evaluation_time  # Should be less than total time