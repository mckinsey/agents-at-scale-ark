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
        """Test LangfuseTraceAdapter can be initialized with optional parameters."""
        from evaluator.oss_providers.langfuse.langfuse_trace_adapter import LangfuseTraceAdapter

        # Test default initialization
        adapter = LangfuseTraceAdapter()
        assert adapter is not None
        assert adapter.create_traces is True  # Default should be True

        # Test with traces disabled
        adapter_no_traces = LangfuseTraceAdapter(create_traces=False)
        assert adapter_no_traces.create_traces is False

    def test_adapter_initialization_with_client(self):
        """Test LangfuseTraceAdapter can be initialized with existing client."""
        from evaluator.oss_providers.langfuse.langfuse_trace_adapter import LangfuseTraceAdapter

        mock_client = Mock()
        adapter = LangfuseTraceAdapter(langfuse_client=mock_client)
        assert adapter._client == mock_client

    @pytest.mark.asyncio
    async def test_trace_creation_and_score_recording(self, mock_langfuse_client, sample_params, sample_scores):
        """Test trace creation and recording external evaluation scores."""
        from evaluator.oss_providers.langfuse.langfuse_trace_adapter import LangfuseTraceAdapter

        adapter = LangfuseTraceAdapter(langfuse_client=mock_langfuse_client)

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

        # Verify trace was updated with metadata (called twice: once in record_scores_to_trace, once at end)
        assert mock_trace.update.call_count == 2

        # Verify client was flushed
        mock_langfuse_client.flush.assert_called_once()

        # Return value should contain trace info
        assert result["trace_id"] == "test-trace-id"
        assert result["scores_recorded"] == len(sample_scores)

    @pytest.mark.asyncio
    async def test_trace_creation_can_be_disabled(self, mock_langfuse_client, sample_params, sample_scores):
        """Test that trace creation can be disabled while still recording scores."""
        from evaluator.oss_providers.langfuse.langfuse_trace_adapter import LangfuseTraceAdapter

        # Test with traces disabled
        adapter = LangfuseTraceAdapter(create_traces=False, langfuse_client=mock_langfuse_client)

        result = await adapter.record_evaluation_trace(
            input_text="Test input",
            output_text="Test output",
            scores=sample_scores,
            params=sample_params
        )

        # Should not create trace when disabled
        mock_langfuse_client.trace.assert_not_called()

        # But should still return result indicating no trace created
        assert result["trace_id"] is None
        assert result["scores_recorded"] == 0

    @pytest.mark.asyncio
    async def test_score_aggregation_and_metadata(self, mock_langfuse_client, sample_params, sample_scores):
        """Test that scores are properly aggregated and metadata is included."""
        from evaluator.oss_providers.langfuse.langfuse_trace_adapter import LangfuseTraceAdapter

        adapter = LangfuseTraceAdapter(langfuse_client=mock_langfuse_client)

        mock_trace = Mock()
        mock_trace.generation = Mock(return_value=Mock(end=Mock()))
        mock_trace.score = Mock()
        mock_trace.update = Mock()
        mock_trace.id = "test-trace-id"
        mock_langfuse_client.trace.return_value = mock_trace

        result = await adapter.record_evaluation_trace(
            input_text="Test input",
            output_text="Test output",
            scores=sample_scores,
            params=sample_params,
            metadata={"model": "gpt-4", "temperature": 0.1}
        )

        # Verify individual scores were recorded
        score_calls = mock_trace.score.call_args_list
        recorded_metrics = [call[1]["name"] for call in score_calls]
        assert "relevance" in recorded_metrics
        assert "correctness" in recorded_metrics
        assert "toxicity" in recorded_metrics
        assert "helpfulness" in recorded_metrics

        # Verify average score was calculated
        update_call = mock_trace.update.call_args[1]
        assert "average_score" in update_call["metadata"]
        expected_avg = sum(sample_scores.values()) / len(sample_scores)
        assert update_call["metadata"]["average_score"] == expected_avg

    def test_parameter_validation(self, sample_params):
        """Test that required parameters are validated."""
        from evaluator.oss_providers.langfuse.langfuse_trace_adapter import LangfuseTraceAdapter

        adapter = LangfuseTraceAdapter()

        # Test with valid params
        assert adapter.validate_params(sample_params) is True

        # Test with missing required params
        invalid_params = {"langfuse.host": "test"}  # Missing keys
        assert adapter.validate_params(invalid_params) is False

        # Test with empty params
        assert adapter.validate_params({}) is False
        assert adapter.validate_params(None) is False

    @pytest.mark.asyncio
    async def test_missing_langfuse_library_handling(self, sample_params, sample_scores):
        """Test graceful handling when Langfuse library is not installed."""
        from evaluator.oss_providers.langfuse.langfuse_trace_adapter import LangfuseTraceAdapter

        adapter = LangfuseTraceAdapter()

        # Mock the import to raise ImportError
        with patch.object(adapter, '_get_langfuse_client') as mock_get_client:
            mock_get_client.side_effect = ImportError(
                "Langfuse library is not installed. Please install it with: pip install langfuse"
            )

            with pytest.raises(ImportError) as exc_info:
                await adapter.record_evaluation_trace(
                    input_text="Test",
                    output_text="Test",
                    scores=sample_scores,
                    params=sample_params
                )

            assert "langfuse" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_trace_with_custom_session_id(self, mock_langfuse_client, sample_params, sample_scores):
        """Test trace creation with custom session ID."""
        from evaluator.oss_providers.langfuse.langfuse_trace_adapter import LangfuseTraceAdapter

        adapter = LangfuseTraceAdapter(langfuse_client=mock_langfuse_client)

        mock_trace = Mock()
        mock_trace.generation = Mock(return_value=Mock(end=Mock()))
        mock_trace.score = Mock()
        mock_trace.update = Mock()
        mock_trace.id = "custom-trace-id"
        mock_langfuse_client.trace.return_value = mock_trace

        session_id = "evaluation-session-123"
        result = await adapter.record_evaluation_trace(
            input_text="Test input",
            output_text="Test output",
            scores=sample_scores,
            params=sample_params,
            session_id=session_id
        )

        # Verify session ID was included in trace metadata
        trace_call = mock_langfuse_client.trace.call_args[1]
        assert trace_call["session_id"] == session_id

    @pytest.mark.asyncio
    async def test_error_handling_during_trace_creation(self, mock_langfuse_client, sample_params, sample_scores):
        """Test error handling when trace creation fails."""
        from evaluator.oss_providers.langfuse.langfuse_trace_adapter import LangfuseTraceAdapter

        adapter = LangfuseTraceAdapter(langfuse_client=mock_langfuse_client)

        # Mock trace creation to fail
        mock_langfuse_client.trace.side_effect = Exception("Trace creation failed")

        with pytest.raises(Exception) as exc_info:
            await adapter.record_evaluation_trace(
                input_text="Test",
                output_text="Test",
                scores=sample_scores,
                params=sample_params
            )

        assert "Trace creation failed" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_batch_score_recording(self, mock_langfuse_client, sample_params):
        """Test recording multiple sets of scores to the same trace."""
        from evaluator.oss_providers.langfuse.langfuse_trace_adapter import LangfuseTraceAdapter

        adapter = LangfuseTraceAdapter(langfuse_client=mock_langfuse_client)

        mock_trace = Mock()
        mock_trace.score = Mock()
        mock_trace.update = Mock()
        mock_trace.id = "batch-trace-id"

        # Test recording scores to existing trace
        await adapter.record_scores_to_trace(
            trace=mock_trace,
            scores={"metric1": 0.8, "metric2": 0.9},
            metadata={"batch": 1}
        )

        await adapter.record_scores_to_trace(
            trace=mock_trace,
            scores={"metric3": 0.7, "metric4": 0.85},
            metadata={"batch": 2}
        )

        # Verify all scores were recorded
        assert mock_trace.score.call_count == 4

        # Verify trace was updated twice
        assert mock_trace.update.call_count == 2