import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from .types import (
    MetricEvaluationResponse, EvaluationResponse,
    UnifiedEvaluationRequest, EvaluationType,
    QueryRef
)
from .evaluator import MetricEvaluator

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Metric Evaluator service started")
    yield
    # Shutdown
    logger.info("Metric Evaluator service stopped")


def create_app() -> FastAPI:
    app = FastAPI(
        title="Metric Evaluator Service",
        description="Performance metrics evaluation service for ARK queries",
        version="0.1.0",
        lifespan=lifespan
    )

    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        if request.url.path == "/health":
            response = await call_next(request)
            return response
        
        logger.info(f"{request.method} {request.url.path}")
        response = await call_next(request)
        logger.info(f"Response status: {response.status_code}")
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        logger.error(f"Validation error on {request.method} {request.url.path}: {exc.errors()}")
        return JSONResponse(
            status_code=422,
            content={"detail": f"Validation error: {exc.errors()}"}
        )

    @app.get("/health")
    async def health():
        return {"status": "healthy", "service": "evaluator-metric"}

    @app.get("/ready")
    async def ready():
        return {"status": "ready", "service": "evaluator-metric"}

    @app.post("/evaluate", response_model=EvaluationResponse)
    async def evaluate_unified(request: UnifiedEvaluationRequest) -> EvaluationResponse:
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
                from .types import DirectRequest
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
                from .types import QueryRefRequest
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