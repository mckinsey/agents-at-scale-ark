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
from .core import EvaluationManager
from .metrics import app as MetricEvaluationApp

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global shared session and evaluation manager
shared_session = None
evaluation_manager = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    global shared_session, evaluation_manager
    shared_session = aiohttp.ClientSession()
    evaluation_manager = EvaluationManager(shared_session=shared_session)
    logger.info("ARK Evaluator service started")
    logger.info(f"Available ARK types: {evaluation_manager.list_ark_types()}")
    logger.info(f"Available OSS providers: {evaluation_manager.list_oss_providers()}")
    yield
    # Shutdown
    if shared_session:
        await shared_session.close()
    logger.info("ARK Evaluator service stopped")




def create_app() -> FastAPI:
    app = FastAPI(
        title="ARK Evaluator Service",
        description="Holistic evaluation service including LLM-as-a-Judge",
        version="0.1.0",
        lifespan=lifespan
    )

    app = MetricEvaluationApp.create_app(app)

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
        return {"status": "healthy", "service": "ark-evaluator"}

    @app.get("/ready")
    async def ready():
        return {"status": "ready", "service": "ark-evaluator"}

    @app.get("/providers/{provider}/metrics")
    async def get_provider_metrics(provider: str):
        """
        Get supported metrics and their field requirements for a specific provider.
        """
        if provider.lower() == "ragas":
            from .oss_providers.ragas.ragas_metrics import MetricRegistry
            metrics = MetricRegistry.get_all_metrics()
            return {
                "provider": "ragas",
                "metrics": [
                    {
                        "name": metric.get_display_name(),
                        "description": metric.get_description(),
                        "ragas_name": metric.get_name()
                    }
                    for metric in metrics.values()
                ]
            }
        else:
            raise HTTPException(status_code=404, detail=f"Provider {provider} not found or doesn't support metric queries")

    @app.get("/providers/{provider}/metrics/{metric}")
    async def get_metric_details(provider: str, metric: str):
        """
        Get detailed field requirements for a specific metric.
        """
        if provider.lower() == "ragas":
            from .oss_providers.ragas.ragas_metrics import MetricRegistry
            metric_info = MetricRegistry.get_metric_info(metric)
            if metric_info:
                return {
                    "provider": "ragas",
                    "metric": metric_info
                }
            else:
                raise HTTPException(status_code=404, detail=f"Metric {metric} not found for provider {provider}")
        else:
            raise HTTPException(status_code=404, detail=f"Provider {provider} not found or doesn't support metric queries")

    @app.post("/evaluate", response_model=EvaluationResponse)
    async def evaluate(request: UnifiedEvaluationRequest) -> EvaluationResponse:
        """
        Unified evaluation endpoint supporting both ARK native and OSS platform evaluations.
        
        Provider selection:
        - No provider param or provider='ark': Use ARK's native evaluation
        - provider='langfuse': Use Langfuse platform
        """
        try:
            provider_name = request.parameters.get('provider', 'ark') if request.parameters else 'ark'
            logger.info(f"Received evaluation request: type={request.type}, provider={provider_name}")
            logger.info(f"Request parameters: {request.parameters}")
            logger.info(f"Request evaluatorName: {request.evaluatorName}")
            
            if not shared_session:
                raise HTTPException(status_code=500, detail="HTTP session not initialized")
            
            if evaluation_manager:
                # Use evaluation manager for routing
                result = await evaluation_manager.evaluate(request)
            else:
                # Fallback to direct factory use (backward compatibility)
                logger.warning("Evaluation manager not initialized, falling back to direct factory")
                provider = EvaluationProviderFactory.create(request.type, shared_session=shared_session)
                result = await provider.evaluate(request)
            
            logger.info(f"Evaluation completed: type={request.type}, provider={provider_name}, score={result.score}, passed={result.passed}")
            return result
                
        except HTTPException:
            raise
        except ValueError as e:
            # Handle provider not found or validation errors
            logger.error(f"Validation error: {str(e)}")
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            logger.error(f"Error processing evaluation request: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))

    return app