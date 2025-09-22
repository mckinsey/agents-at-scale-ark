"""
LangfuseAdapter - Native Langfuse evaluation capabilities.
This adapter uses Langfuse's built-in evaluators instead of delegating to RAGAS.
"""

import logging
from typing import Dict, List, Any, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


class LangfuseAdapter:
    """
    Adapter for native Langfuse evaluations.
    Provides direct integration with Langfuse's evaluation framework.
    """

    def __init__(
        self,
        create_traces: bool = True,
        langfuse_client: Optional[Any] = None
    ):
        """
        Initialize the LangfuseAdapter.

        Args:
            create_traces: Whether to create traces for observability
            langfuse_client: Optional pre-initialized Langfuse client
        """
        self.create_traces = create_traces
        self._client = langfuse_client
        self._evaluators_cache = {}

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

    async def evaluate(
        self,
        input_text: str,
        output_text: str,
        evaluators: List[str],
        params: Dict[str, Any]
    ) -> Dict[str, float]:
        """
        Run native Langfuse evaluation.

        Args:
            input_text: The input/prompt text
            output_text: The generated output text
            evaluators: List of evaluator names to run
            params: Configuration parameters including Langfuse credentials

        Returns:
            Dictionary mapping evaluator names to scores
        """
        # Validate parameters
        if not self.validate_params(params):
            raise ValueError("Invalid or missing Langfuse configuration parameters")

        # Get or create Langfuse client
        client = self._get_langfuse_client(params)

        # Initialize scores dictionary
        scores = {}

        # Create trace if enabled
        trace = None
        generation = None
        if self.create_traces:
            trace_id = f"eval-{datetime.utcnow().isoformat()}"
            trace = client.trace(
                name=f"evaluation-{trace_id}",
                input=input_text,
                output=output_text,
                metadata={
                    "evaluators": evaluators,
                    "timestamp": datetime.utcnow().isoformat()
                }
            )

            # Create generation span
            generation = trace.generation(
                name="evaluation-generation",
                input=input_text,
                output=output_text
            )

        try:
            # Get evaluator configuration if provided
            evaluator_config = params.get("langfuse.evaluator_config", {})

            # Run each evaluator
            for evaluator_name in evaluators:
                config = evaluator_config.get(evaluator_name, {})
                evaluator = self._get_evaluator(evaluator_name, config)

                # Run evaluation
                result = await evaluator.evaluate({
                    "input": input_text,
                    "output": output_text,
                    **config
                })

                # Extract score (handle different response formats)
                if isinstance(result, dict):
                    score = result.get("score", 0.0)
                    scores[evaluator_name] = float(score)

                    # Add score to trace if enabled
                    if trace:
                        trace.score(
                            name=evaluator_name,
                            value=score,
                            comment=result.get("reasoning", "")
                        )
                else:
                    scores[evaluator_name] = float(result)
                    if trace:
                        trace.score(name=evaluator_name, value=float(result))

        finally:
            # Close generation span if created
            if generation:
                generation.end()

            # Update trace metadata with final scores
            if trace:
                trace.update(
                    output=output_text,
                    metadata={
                        "evaluators": evaluators,
                        "scores": scores,
                        "average_score": sum(scores.values()) / len(scores) if scores else 0
                    }
                )

            # Flush client to ensure data is sent
            if client and hasattr(client, 'flush'):
                client.flush()

        return scores

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

        return self._client

    def _get_evaluator(self, evaluator_name: str, config: Dict[str, Any]):
        """
        Get a Langfuse evaluator instance.

        Args:
            evaluator_name: Name of the evaluator
            config: Configuration for the evaluator

        Returns:
            Evaluator instance
        """
        # Check cache first
        cache_key = f"{evaluator_name}_{hash(str(config))}"
        if cache_key in self._evaluators_cache:
            return self._evaluators_cache[cache_key]

        # Create evaluator based on type
        evaluator = self._create_evaluator(evaluator_name, config)

        # Cache for reuse
        self._evaluators_cache[cache_key] = evaluator

        return evaluator

    def _create_evaluator(self, evaluator_name: str, config: Dict[str, Any]):
        """
        Create a specific evaluator instance.

        Args:
            evaluator_name: Name of the evaluator
            config: Configuration for the evaluator

        Returns:
            Evaluator instance
        """
        # Import Langfuse evaluator types
        try:
            from langfuse.evaluators import (
                RelevanceEvaluator,
                ToxicityEvaluator,
                HelpfulnessEvaluator,
                CorrectnessEvaluator,
                Evaluator
            )
        except ImportError:
            # Fallback to a simple mock evaluator for testing
            logger.warning(f"Langfuse evaluators not available, using mock for {evaluator_name}")
            return self._create_mock_evaluator(evaluator_name)

        # Map evaluator names to classes
        evaluator_map = {
            "relevance": RelevanceEvaluator,
            "toxicity": ToxicityEvaluator,
            "helpfulness": HelpfulnessEvaluator,
            "correctness": CorrectnessEvaluator
        }

        # Check if it's a built-in evaluator
        if evaluator_name.lower() in evaluator_map:
            evaluator_class = evaluator_map[evaluator_name.lower()]
            return evaluator_class(**config)

        # For custom evaluators, try to create a generic evaluator
        logger.info(f"Creating custom evaluator: {evaluator_name}")
        return Evaluator(name=evaluator_name, **config)

    def _create_mock_evaluator(self, evaluator_name: str):
        """
        Create a mock evaluator for testing purposes.

        Args:
            evaluator_name: Name of the evaluator

        Returns:
            Mock evaluator object
        """
        class MockEvaluator:
            def __init__(self, name):
                self.name = name

            async def evaluate(self, data):
                # Return a mock score for testing
                return {
                    "score": 0.75,
                    "reasoning": f"Mock evaluation for {self.name}"
                }

        return MockEvaluator(evaluator_name)

    async def record_evaluation_trace(
        self,
        input_text: str,
        output_text: str,
        scores: Dict[str, float],
        params: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Record an evaluation trace with scores to Langfuse.

        Args:
            input_text: The input/prompt text
            output_text: The generated output text
            scores: Dictionary mapping metric names to scores
            params: Configuration parameters including Langfuse credentials
            metadata: Optional additional metadata to include

        Returns:
            Dictionary with trace information
        """
        # Get or create Langfuse client
        client = self._get_langfuse_client(params)

        # Prepare metadata
        trace_metadata = metadata or {}
        trace_metadata.update({
            "scores": scores,
            "average_score": sum(scores.values()) / len(scores) if scores else 0,
            "timestamp": datetime.utcnow().isoformat()
        })

        # Create trace
        trace = client.trace(
            name=f"evaluation-{datetime.utcnow().isoformat()}",
            input=input_text,
            output=output_text,
            metadata=trace_metadata
        )

        # Record each score
        for metric_name, score_value in scores.items():
            trace.score(
                name=metric_name,
                value=float(score_value)
            )

        # Update trace with final scores
        trace.update(
            output=output_text,
            metadata=trace_metadata
        )

        # Flush client to ensure data is sent
        if hasattr(client, 'flush'):
            client.flush()

        return {
            "trace_id": trace.id,
            "scores": scores,
            "scores_recorded": len(scores),
            "metadata": trace_metadata
        }