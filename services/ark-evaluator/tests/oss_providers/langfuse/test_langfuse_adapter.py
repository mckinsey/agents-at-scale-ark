"""
Tests for LangfuseTraceAdapter - Langfuse tracing and score recording capabilities.
Following TDD approach - these tests are written before implementation.

Note: Langfuse Python SDK does NOT provide built-in LLM-as-a-Judge evaluators.
This adapter focuses on tracing and score recording only.
"""

import pytest
from unittest.mock import Mock, AsyncMock, patch, MagicMock
import sys
from pathlib import Path
from typing import Dict, Any

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "src"))


class TestLangfuseTraceAdapter:
    """Test suite for LangfuseTraceAdapter focusing on tracing and score recording."""

    @pytest.fixture
    def mock_langfuse_client(self):
        """Create a mock Langfuse client."""
        client = Mock()
        client.score = Mock()
        client.flush = Mock()
        return client

    @pytest.fixture
    def sample_params(self) -> Dict[str, Any]:
        """Sample parameters for Langfuse configuration."""
        return {
            "langfuse.host": "https://cloud.langfuse.com",
            "langfuse.public_key": "test-public-key",
            "langfuse.secret_key": "test-secret-key"
        }

    @pytest.fixture
    def sample_scores(self) -> Dict[str, float]:
        """Sample evaluation scores from external source."""
        return {
            "relevance": 0.85,
            "correctness": 0.92,
            "toxicity": 0.1,  # Lower is better for toxicity
            "helpfulness": 0.78
        }

    def test_adapter_initialization(self):
        """Test LangfuseAdapter can be initialized with optional parameters."""
        from evaluator.oss_providers.langfuse.langfuse_adapter import LangfuseAdapter

        # Test default initialization
        adapter = LangfuseAdapter()
        assert adapter is not None
        assert adapter.create_traces is True  # Default should be True

        # Test with traces disabled
        adapter_no_traces = LangfuseAdapter(create_traces=False)
        assert adapter_no_traces.create_traces is False

    def test_adapter_initialization_with_client(self):
        """Test LangfuseAdapter can be initialized with existing client."""
        from evaluator.oss_providers.langfuse.langfuse_adapter import LangfuseAdapter

        mock_client = Mock()
        adapter = LangfuseAdapter(langfuse_client=mock_client)
        assert adapter._client == mock_client

    @pytest.mark.asyncio
    async def test_trace_creation_and_score_recording(self, mock_langfuse_client, sample_params, sample_scores):
        """Test trace creation and recording external evaluation scores."""
        from evaluator.oss_providers.langfuse.langfuse_adapter import LangfuseAdapter

        adapter = LangfuseAdapter(langfuse_client=mock_langfuse_client)

        # Mock trace object
        mock_trace = Mock()
        mock_trace.generation = Mock(return_value=Mock(end=Mock()))
        mock_trace.score = Mock()
        mock_trace.update = Mock()
        mock_trace.id = "test-trace-id"
        mock_langfuse_client.trace.return_value = mock_trace

        result = await adapter.record_evaluation_trace(
            input_text="What is the capital of France?",
            output_text="The capital of France is Paris.",
            scores=sample_scores,
            params=sample_params,
            metadata={"evaluator": "ragas", "session": "test-session"}
        )

        # Verify trace was created
        mock_langfuse_client.trace.assert_called_once()
        trace_call = mock_langfuse_client.trace.call_args[1]
        assert "What is the capital of France?" in trace_call["input"]
        assert "The capital of France is Paris." in trace_call["output"]

        # Verify scores were recorded
        assert mock_trace.score.call_count == len(sample_scores)

        # Verify trace was updated with metadata
        mock_trace.update.assert_called_once()

        # Verify client was flushed
        mock_langfuse_client.flush.assert_called_once()

        # Return value should contain trace info
        assert result["trace_id"] == "test-trace-id"
        assert result["scores_recorded"] == len(sample_scores)

    @pytest.mark.asyncio
    async def test_score_calculation_and_aggregation(self, sample_params):
        """Test that scores are properly calculated and aggregated."""
        from evaluator.oss_providers.langfuse.langfuse_adapter import LangfuseAdapter

        adapter = LangfuseAdapter(create_traces=False)

        # Mock evaluator with different scores
        mock_evaluators = {
            "relevance": AsyncMock(evaluate=AsyncMock(return_value={"score": 0.9})),
            "toxicity": AsyncMock(evaluate=AsyncMock(return_value={"score": 0.1})),  # Low is good
            "helpfulness": AsyncMock(evaluate=AsyncMock(return_value={"score": 0.8}))
        }

        with patch.object(adapter, '_get_evaluator', side_effect=lambda name, _: mock_evaluators[name]):
            with patch.object(adapter, '_get_langfuse_client', return_value=Mock()):
                scores = await adapter.evaluate(
                    input_text="Test input",
                    output_text="Test output",
                    evaluators=["relevance", "toxicity", "helpfulness"],
                    params=sample_params
                )

                assert len(scores) == 3
                assert scores["relevance"] == 0.9
                assert scores["toxicity"] == 0.1
                assert scores["helpfulness"] == 0.8

                # Test average calculation
                average = sum(scores.values()) / len(scores)
                assert average == pytest.approx(0.6, rel=1e-2)

    @pytest.mark.asyncio
    async def test_missing_langfuse_library_handling(self, sample_params):
        """Test graceful handling when Langfuse library is not installed."""
        from evaluator.oss_providers.langfuse.langfuse_adapter import LangfuseAdapter

        adapter = LangfuseAdapter()

        # Mock the import to raise ImportError
        with patch.object(adapter, '_get_langfuse_client') as mock_get_client:
            mock_get_client.side_effect = ImportError(
                "Langfuse library is not installed. Please install it with: pip install langfuse"
            )

            with pytest.raises(ImportError) as exc_info:
                await adapter.evaluate(
                    input_text="Test",
                    output_text="Test",
                    evaluators=["relevance"],
                    params=sample_params
                )

            assert "langfuse" in str(exc_info.value).lower()

    def test_parameter_validation(self, sample_params):
        """Test that required parameters are validated."""
        from evaluator.oss_providers.langfuse.langfuse_adapter import LangfuseAdapter

        adapter = LangfuseAdapter()

        # Test with valid params
        assert adapter.validate_params(sample_params) is True

        # Test with missing required params
        invalid_params = {"langfuse.host": "test"}  # Missing keys
        assert adapter.validate_params(invalid_params) is False

        # Test with empty params
        assert adapter.validate_params({}) is False
        assert adapter.validate_params(None) is False

    @pytest.mark.asyncio
    async def test_trace_creation_optional(self, mock_langfuse_client, sample_params):
        """Test that trace creation can be disabled."""
        from evaluator.oss_providers.langfuse.langfuse_adapter import LangfuseAdapter

        # Test with traces disabled
        adapter_no_traces = LangfuseAdapter(create_traces=False, langfuse_client=mock_langfuse_client)

        mock_evaluator = AsyncMock(evaluate=AsyncMock(return_value={"score": 0.75}))
        with patch.object(adapter_no_traces, '_get_evaluator', return_value=mock_evaluator):
            scores = await adapter_no_traces.evaluate(
                input_text="Test",
                output_text="Response",
                evaluators=["relevance"],
                params=sample_params
            )

            # Should not create trace
            mock_langfuse_client.trace.assert_not_called()
            assert scores["relevance"] == 0.75

        # Test with traces enabled (default)
        mock_langfuse_client.reset_mock()  # Reset mock for next test
        adapter_with_traces = LangfuseAdapter(create_traces=True, langfuse_client=mock_langfuse_client)
        mock_langfuse_client.trace.return_value = Mock(
            generation=Mock(return_value=Mock(end=Mock())),
            score=Mock(),
            update=Mock(),
            id="test-trace-id"
        )

        with patch.object(adapter_with_traces, '_get_evaluator', return_value=mock_evaluator):
            scores = await adapter_with_traces.evaluate(
                input_text="Test",
                output_text="Response",
                evaluators=["relevance"],
                params=sample_params
            )

            # Should create trace
            mock_langfuse_client.trace.assert_called_once()

    @pytest.mark.asyncio
    async def test_custom_evaluator_support(self, sample_params):
        """Test support for custom Langfuse evaluators."""
        from evaluator.oss_providers.langfuse.langfuse_adapter import LangfuseAdapter

        adapter = LangfuseAdapter()

        # Mock custom evaluator
        mock_custom_evaluator = AsyncMock()
        mock_custom_evaluator.evaluate = AsyncMock(return_value={
            "score": 0.95,
            "reasoning": "Custom evaluation passed"
        })

        with patch.object(adapter, '_get_evaluator', return_value=mock_custom_evaluator):
            with patch.object(adapter, '_get_langfuse_client', return_value=Mock()):
                scores = await adapter.evaluate(
                    input_text="Custom test",
                    output_text="Custom response",
                    evaluators=["custom_evaluator_v1"],
                    params=sample_params
                )

                assert "custom_evaluator_v1" in scores
                assert scores["custom_evaluator_v1"] == 0.95

    @pytest.mark.asyncio
    async def test_error_handling_in_evaluation(self, sample_params):
        """Test error handling when evaluation fails."""
        from evaluator.oss_providers.langfuse.langfuse_adapter import LangfuseAdapter

        adapter = LangfuseAdapter()

        # Mock evaluator that raises an error
        mock_evaluator = AsyncMock()
        mock_evaluator.evaluate = AsyncMock(side_effect=Exception("Evaluation failed"))

        with patch.object(adapter, '_get_evaluator', return_value=mock_evaluator):
            with patch.object(adapter, '_get_langfuse_client', return_value=Mock()):
                with pytest.raises(Exception) as exc_info:
                    await adapter.evaluate(
                        input_text="Test",
                        output_text="Response",
                        evaluators=["relevance"],
                        params=sample_params
                    )

                assert "Evaluation failed" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_evaluator_configuration(self, sample_params):
        """Test that evaluators can be configured with custom settings."""
        from evaluator.oss_providers.langfuse.langfuse_adapter import LangfuseAdapter

        adapter = LangfuseAdapter()

        # Add custom evaluator configuration
        params_with_config = {
            **sample_params,
            "langfuse.evaluator_config": {
                "relevance": {
                    "threshold": 0.7,
                    "model": "gpt-4"
                },
                "toxicity": {
                    "threshold": 0.3,
                    "model": "gpt-3.5-turbo"
                }
            }
        }

        mock_evaluator = AsyncMock(evaluate=AsyncMock(return_value={"score": 0.8}))

        with patch.object(adapter, '_get_evaluator') as mock_get_evaluator:
            mock_get_evaluator.return_value = mock_evaluator
            with patch.object(adapter, '_get_langfuse_client', return_value=Mock()):
                await adapter.evaluate(
                    input_text="Test",
                    output_text="Response",
                    evaluators=["relevance"],
                    params=params_with_config
                )

                # Verify evaluator was configured with custom settings
                mock_get_evaluator.assert_called_with(
                    "relevance",
                    {"threshold": 0.7, "model": "gpt-4"}
                )