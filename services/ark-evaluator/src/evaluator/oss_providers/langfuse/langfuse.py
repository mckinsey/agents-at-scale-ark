"""
Langfuse evaluation provider integration.
"""

import logging
from typing import Optional, Dict, Any, List
import uuid
from datetime import datetime

from ...types import EvaluationParameters, UnifiedEvaluationRequest, EvaluationResponse, TokenUsage
from ...core.interface import OSSEvaluationProvider
from ...core.config import PlatformConfiguration

logger = logging.getLogger(__name__)


class LangfuseProvider(OSSEvaluationProvider):
    """
    Hybrid provider that uses RAGAS for evaluation and Langfuse for tracing/observability.

    Note: Langfuse Python SDK does not provide built-in LLM-as-a-Judge evaluators.
    This provider combines:
    - RAGAS: Actual evaluation logic and scoring
    - Langfuse: Tracing, observability, and score recording
    """
    
    def __init__(self, shared_session=None):
        super().__init__(shared_session)
        self.langfuse_client = None
        
    def get_evaluation_type(self) -> str:
        return "langfuse"
    
    def get_required_parameters(self) -> List[str]:
        """
        Get required parameters for Langfuse integration.
        """
        return ["langfuse.host", "langfuse.public_key", "langfuse.secret_key"]
    
    async def evaluate(self, request: UnifiedEvaluationRequest) -> EvaluationResponse:
        """
        Execute Langfuse-based evaluation.
        """
        # Extract input/output from config
        input_text = request.config.input or ""
        output_text = request.config.output or ""
        evaluation_id = f"{request.evaluatorName or 'langfuse'}-{hash(input_text + output_text)}"
        
        logger.info(f"Starting Langfuse evaluation for request: {evaluation_id}")
        
        try:
            # Lazy import to avoid dependency issues
            from langfuse import Langfuse
            
            # Initialize Langfuse client
            langfuse_client = self._get_langfuse_client(request.parameters)
            
            # Create trace in Langfuse
            trace = langfuse_client.trace(
                name=f"evaluation-{evaluation_id}",
                input=input_text,
                output=output_text,
                metadata={
                    "evaluator_name": request.evaluatorName,
                    "evaluation_type": "langfuse",
                    "request_type": request.type.value
                }
            )
            
            # Create a generation span for the evaluation
            generation = trace.generation(
                name="llm-evaluation",
                input=input_text,
                output=output_text,
                model=request.parameters.get("langfuse.model", "gpt-4") if request.parameters else "gpt-4"
            )
            
            # Run evaluation scoring
            scores = await self._run_evaluations(langfuse_client, trace, request)
            
            # Calculate overall score
            overall_score = sum(scores.values()) / len(scores) if scores else 0.0
            
            # Get threshold from parameters
            threshold = float(request.parameters.get("threshold", "0.7")) if request.parameters else 0.7
            
            # Finalize trace
            generation.end()
            
            # Keep original output but add evaluation results as metadata
            evaluation_results = {
                "score": overall_score,
                "passed": overall_score >= threshold,
                "scores": scores
            }
            
            # Extract context info if provided
            eval_params = EvaluationParameters.from_request_params(request.parameters)
            context_source = eval_params.context_source or "undefined"
            context_length = len(eval_params.context or "")
            
            # Build metadata with evaluation results
            updated_metadata = {
                "evaluator_name": request.evaluatorName,
                "evaluation_type": "langfuse",
                "request_type": request.type.value,
                "context_source": context_source,
                "context_length": context_length,
                "evaluation_results": evaluation_results
            }
            
            trace.update(
                output=output_text,  # Keep the original output
                metadata=updated_metadata
            )
            
            # Flush to ensure data is sent
            langfuse_client.flush()
            
            logger.info(f"Langfuse evaluation completed with score: {overall_score}")
            
            return EvaluationResponse(
                score=str(overall_score),
                passed=overall_score >= threshold,
                metadata={
                    "provider": "langfuse",
                    "trace_id": str(trace.id),
                    "trace_url": f"{request.parameters.get('langfuse.host', '')}/trace/{trace.id}",
                    "scores": str(scores),
                    "threshold": str(threshold)
                },
                tokenUsage=TokenUsage()
            )
            
        except ImportError as e:
            logger.error(f"Langfuse library not installed: {str(e)}")
            return EvaluationResponse(
                score="0.0",
                passed=False,
                metadata={
                    "provider": "langfuse",
                    "error": "Langfuse library not installed. Install with: pip install langfuse"
                },
                error="Langfuse library not installed"
            )
        except Exception as e:
            logger.error(f"Error during Langfuse evaluation: {str(e)}")
            return EvaluationResponse(
                score="0.0",
                passed=False,
                metadata={
                    "provider": "langfuse",
                    "error": str(e)
                },
                error=str(e)
            )
    
    def _get_langfuse_client(self, parameters: Optional[Dict[str, Any]]):
        """
        Initialize or return cached Langfuse client.
        """
        if self.langfuse_client is not None:
            return self.langfuse_client
            
        if not parameters:
            raise ValueError("Parameters required for Langfuse configuration")
        
        # Create configuration from parameters
        config = PlatformConfiguration.from_parameters("langfuse", parameters)
        
        # Validate required fields
        if not config.validate(["host", "public_key", "secret_key"]):
            raise ValueError("Missing required Langfuse configuration")
        
        connection_params = config.get_connection_params()
        
        logger.info(f"Initializing Langfuse client with host: {connection_params.get('host')}")
        
        # Initialize Langfuse client
        from langfuse import Langfuse
        
        self.langfuse_client = Langfuse(
            host=connection_params.get('host'),
            public_key=connection_params.get('public_key'),
            secret_key=connection_params.get('secret_key')
        )
        
        return self.langfuse_client
    
    async def _run_evaluations(self, client, trace, request: UnifiedEvaluationRequest) -> Dict[str, float]:
        """
        Run evaluation metrics using RAGAS and record results to Langfuse for observability.
        Note: Langfuse is used for tracing only - actual evaluation is done by RAGAS.
        """
        scores = {}
        
        try:
            # Extract evaluation parameters
            
            params = EvaluationParameters.from_request_params(request.parameters or {})
            evaluation_scope = request.parameters.get("metrics", request.parameters.get("scope", "relevance,correctness,toxicity"))
            
            # Define evaluation metrics based on scope
            if evaluation_scope == "all":
                metrics = ["relevance", "correctness", "toxicity", "helpfulness", "clarity"]
            else:
                metrics = [s.strip() for s in evaluation_scope.split(",")]
            
            # Get input and output for evaluation
            config = request.get_config_for_type()
            input_text = config.input if hasattr(config, 'input') else ""
            output_text = config.output if hasattr(config, 'output') else ""
            
            if not input_text or not output_text:
                logger.warning("Missing input or output for evaluation")
                return {"error": 0.0}
            
            # Use RAGAS for actual evaluation, Langfuse for tracing/observability
            from ..ragas.ragas_adapter import RagasAdapter
            from .langfuse_trace_adapter import LangfuseTraceAdapter

            # Run RAGAS evaluation
            ragas_adapter = RagasAdapter()
            ragas_scores = await ragas_adapter.evaluate(input_text, output_text, metrics, request.parameters)

            # Record RAGAS results to Langfuse trace using trace adapter
            trace_adapter = LangfuseTraceAdapter(langfuse_client=client)
            await trace_adapter.record_scores_to_trace(
                trace=trace,
                scores=ragas_scores,
                metadata={
                    "evaluator": "ragas",
                    "evaluation_type": "hybrid_ragas_langfuse",
                    "metrics": metrics
                }
            )
            
            # Return RAGAS scores (scores are already recorded to Langfuse trace above)
            scores = ragas_scores

            logger.info(f"Evaluated {len(metrics)} metrics with RAGAS and recorded to Langfuse: {scores}")

        except Exception as e:
            logger.error(f"Error running RAGAS evaluations or recording to Langfuse: {e}")
            # Return a default failed score
            scores["error"] = 0.0

        return scores
    