"""
LangfuseTraceAdapter - Langfuse tracing and score recording capabilities.

This adapter focuses on what Langfuse SDK actually provides:
- Tracing and observability features
- Manual score recording from external evaluations
- Session management

Note: Langfuse Python SDK does NOT provide built-in LLM-as-a-Judge evaluators.
"""

import logging
from typing import Dict, List, Any, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


class LangfuseTraceAdapter:
    """
    Adapter for Langfuse tracing and score recording.
    Provides clean interface for observability and external score recording.
    """

    def __init__(
        self,
        create_traces: bool = True,
        langfuse_client: Optional[Any] = None
    ):
        """
        Initialize the LangfuseTraceAdapter.

        Args:
            create_traces: Whether to create traces for observability
            langfuse_client: Optional pre-initialized Langfuse client
        """
        self.create_traces = create_traces
        self._client = langfuse_client

    def validate_params(self, params: Optional[Dict[str, Any]]) -> bool:
        """
        Validate that required parameters are present.

        Args:
            params: Parameters dictionary

        Returns:
            True if all required parameters are present
        """
        if not params:
            logger.warning("No parameters provided for Langfuse configuration")
            return False

        required_keys = ["langfuse.host", "langfuse.public_key", "langfuse.secret_key"]
        for key in required_keys:
            if key not in params:
                logger.warning(f"Missing required parameter: {key}")
                return False

        return True

    async def record_evaluation_trace(
        self,
        input_text: str,
        output_text: str,
        scores: Dict[str, float],
        params: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None,
        session_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a trace and record evaluation scores from external evaluators.

        Args:
            input_text: The input/prompt text
            output_text: The generated output text
            scores: Evaluation scores from external evaluators (e.g., RAGAS)
            params: Configuration parameters including Langfuse credentials
            metadata: Additional metadata to include in trace
            session_id: Optional session ID for grouping traces

        Returns:
            Dictionary with trace information and recording status
        """
        # If tracing is disabled, return early
        if not self.create_traces:
            logger.info("Trace creation disabled, skipping")
            return {
                "trace_id": None,
                "scores_recorded": 0,
                "status": "disabled"
            }

        # Validate parameters
        if not self.validate_params(params):
            raise ValueError("Invalid or missing Langfuse configuration parameters")

        # Get or create Langfuse client
        client = self._get_langfuse_client(params)

        # Create trace
        trace_id = f"eval-{datetime.utcnow().isoformat()}"
        trace_metadata = {
            "timestamp": datetime.utcnow().isoformat(),
            "scores_count": len(scores),
            "average_score": sum(scores.values()) / len(scores) if scores else 0,
            **(metadata or {})
        }

        trace = client.trace(
            name=f"evaluation-{trace_id}",
            input=input_text,
            output=output_text,
            metadata=trace_metadata,
            session_id=session_id
        )

        # Create generation span
        generation = trace.generation(
            name="evaluation-generation",
            input=input_text,
            output=output_text
        )

        try:
            # Record scores from external evaluators
            scores_recorded = await self.record_scores_to_trace(
                trace=trace,
                scores=scores,
                metadata=metadata
            )

            # Update trace with final metadata
            trace.update(
                output=output_text,
                metadata=trace_metadata
            )

            return {
                "trace_id": str(trace.id),
                "scores_recorded": scores_recorded,
                "status": "success",
                "average_score": trace_metadata["average_score"]
            }

        finally:
            # Close generation span
            if generation:
                generation.end()

            # Flush client to ensure data is sent
            if client and hasattr(client, 'flush'):
                client.flush()

    async def record_scores_to_trace(
        self,
        trace: Any,
        scores: Dict[str, float],
        metadata: Optional[Dict[str, Any]] = None
    ) -> int:
        """
        Record evaluation scores to an existing trace.

        Args:
            trace: Langfuse trace object
            scores: Dictionary of evaluation scores
            metadata: Additional metadata for context

        Returns:
            Number of scores recorded
        """
        scores_recorded = 0

        for metric_name, score_value in scores.items():
            try:
                # Record individual score
                trace.score(
                    name=metric_name,
                    value=float(score_value),
                    comment=f"External evaluation score for {metric_name}",
                    data_type="NUMERIC"
                )
                scores_recorded += 1
                logger.debug(f"Recorded score for {metric_name}: {score_value}")

            except Exception as e:
                logger.error(f"Failed to record score for {metric_name}: {e}")

        # Update trace metadata with score summary
        if metadata:
            trace.update(metadata={
                **metadata,
                "scores_recorded": scores_recorded,
                "total_scores": len(scores)
            })

        logger.info(f"Recorded {scores_recorded}/{len(scores)} scores to trace")
        return scores_recorded

    def _get_langfuse_client(self, params: Dict[str, Any]):
        """
        Get or create Langfuse client.

        Args:
            params: Configuration parameters

        Returns:
            Langfuse client instance
        """
        if self._client:
            return self._client

        try:
            from langfuse import Langfuse
        except ImportError:
            raise ImportError(
                "Langfuse library is not installed. "
                "Please install it with: pip install langfuse"
            )

        # Create new client
        self._client = Langfuse(
            host=params.get("langfuse.host"),
            public_key=params.get("langfuse.public_key"),
            secret_key=params.get("langfuse.secret_key")
        )

        logger.info(f"Initialized Langfuse client for host: {params.get('langfuse.host')}")
        return self._client

    async def create_session(
        self,
        session_id: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Create a new evaluation session for grouping related traces.

        Args:
            session_id: Unique identifier for the session
            metadata: Session metadata

        Returns:
            Session ID
        """
        # Note: Langfuse automatically handles sessions via session_id in traces
        # This method is for consistency and future enhancements
        logger.info(f"Creating evaluation session: {session_id}")
        return session_id

    async def close(self):
        """
        Close the adapter and cleanup resources.
        """
        if self._client and hasattr(self._client, 'flush'):
            self._client.flush()
            logger.info("Langfuse client flushed and closed")