import logging
from fastapi import FastAPI, HTTPException
from ..types import (
    EvaluationResponse, UnifiedEvaluationRequest, EvaluationType,
)
from .evaluator import MetricEvaluator

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def create_app(app: FastAPI) -> FastAPI:

    @app.post("/evaluate-metrics", response_model=EvaluationResponse)
    async def evaluate(request: UnifiedEvaluationRequest) -> EvaluationResponse:
        """
        Unified evaluation endpoint for metric evaluations
        """
        try:
            logger.info(f"Received evaluation request: type={request.type}")
            
            # Create a new evaluator instance for each request
            evaluator = MetricEvaluator(request.parameters or {})
            
            # Handle different evaluation types
            if request.type == EvaluationType.DIRECT:
                # Direct metric evaluation
                if not hasattr(request.config, 'input') or not hasattr(request.config, 'output'):
                    raise HTTPException(status_code=422, detail="Direct evaluation requires input and output in config")
                
                # Create DirectRequest object
                from .metric_types import DirectRequest
                direct_request = DirectRequest(
                    input=request.config.input,
                    output=request.config.output,
                    parameters=request.parameters or {}
                )
                
                # Evaluate metrics for the direct input/output
                result = await evaluator.evaluate_direct(direct_request)
                
                return result
                
            elif request.type == EvaluationType.QUERY:
                # Query-based metric evaluation
                if not request.config.queryRef:
                    raise HTTPException(status_code=422, detail="Query evaluation requires queryRef in config")
                
                # Create QueryRefRequest object with the queryRef object directly
                from .metric_types import QueryRefRequest
                query_request = QueryRefRequest(queryRef=request.config.queryRef, parameters=request.parameters or {})
                
                # Evaluate metrics for the referenced query
                result = await evaluator.evaluate_query_ref(query_request)
                
                return result
                
            elif request.type == EvaluationType.BATCH:
                # Batch evaluation not supported yet in metric evaluator
                raise HTTPException(status_code=501, detail="Batch evaluation not yet implemented in metric evaluator")
                
            else:
                raise HTTPException(status_code=400, detail=f"Metric evaluator does not support evaluation type: {request.type}")
                
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error processing evaluation request: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))
    

    return app