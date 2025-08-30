import logging
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
import aiohttp
from .types import (
    EvaluationResponse,
    UnifiedEvaluationRequest
)
from .providers import EvaluationProviderFactory

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global shared session for all evaluator instances
shared_session = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    global shared_session
    shared_session = aiohttp.ClientSession()
    logger.info("LLM Evaluator service started")
    yield
    # Shutdown
    if shared_session:
        await shared_session.close()
    logger.info("LLM Evaluator service stopped")




def create_app() -> FastAPI:
    app = FastAPI(
        title="LLM Evaluator Service",
        description="AI-powered query evaluation service using LLM-as-a-Judge",
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
        return {"status": "healthy", "service": "evaluator-llm"}

    @app.get("/ready")
    async def ready():
        return {"status": "ready", "service": "evaluator-llm"}

    @app.post("/evaluate", response_model=EvaluationResponse)
    async def evaluate_unified(request: UnifiedEvaluationRequest) -> EvaluationResponse:
        """
        Unified evaluation endpoint supporting all evaluation types
        """
        try:
            logger.info(f"Received evaluation request: type={request.type}")
            logger.info(f"Request parameters: {request.parameters}")
            logger.info(f"Request evaluatorName: {request.evaluatorName}")
            
            if not shared_session:
                raise HTTPException(status_code=500, detail="HTTP session not initialized")
            
            # Use factory to create appropriate evaluation provider
            provider = EvaluationProviderFactory.create(request.type, shared_session=shared_session)
            
            # Execute evaluation using the provider
            result = await provider.evaluate(request)
            
            logger.info(f"Evaluation completed: type={request.type}, score={result.score}, passed={result.passed}")
            return result
                
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error processing evaluation request: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))

    return app