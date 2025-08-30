from fastapi import HTTPException
import logging

from .base import EvaluationProvider
from ..types import (
    UnifiedEvaluationRequest, EvaluationResponse, EvaluationRequest,
    Response, QueryTarget, EvaluationParameters
)
from ..evaluator import LLMEvaluator

logger = logging.getLogger(__name__)


class DirectEvaluationProvider(EvaluationProvider):
    """
    Provider for direct evaluation type.
    Evaluates a single input/output pair directly.
    """
    
    def get_evaluation_type(self) -> str:
        return "direct"
    
    async def evaluate(self, request: UnifiedEvaluationRequest) -> EvaluationResponse:
        """
        Execute direct evaluation on the provided input/output pair.
        """
        logger.info(f"Processing direct evaluation with evaluator: {request.evaluatorName}")
        
        # Validate direct evaluation requirements
        if not request.config or not hasattr(request.config, 'input'):
            raise HTTPException(status_code=422, detail="Direct evaluation requires input in config")
        
        # Extract model reference from parameters
        model_ref = self._extract_model_ref(request.parameters)
        if not model_ref:
            raise HTTPException(status_code=422, detail="Direct evaluation requires model configuration in parameters")
        
        # Create evaluation request
        eval_request = EvaluationRequest(
            queryId="direct-evaluation",
            input=request.config.input,
            responses=[Response(
                target=QueryTarget(type="system", name="direct-output"),
                content=request.config.output or ""
            )],
            query={"metadata": {"name": "direct-evaluation"}, "spec": {"input": request.config.input}},
            modelRef=model_ref
        )
        
        # Extract golden examples from parameters if present
        golden_examples = self._extract_golden_examples(request.parameters)
        
        # Create and use evaluator
        evaluator = LLMEvaluator(session=self.shared_session)
        
        result = await evaluator.evaluate(
            eval_request,
            EvaluationParameters.from_request_params(request.parameters or {}),
            golden_examples=golden_examples
        )
        
        logger.info(f"Direct evaluation completed: score={result.score}, passed={result.passed}")
        return result